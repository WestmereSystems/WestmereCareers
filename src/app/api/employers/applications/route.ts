import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import {
  ApiError,
  apiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const jobId = z
      .uuid()
      .safeParse(new URL(request.url).searchParams.get("job"));
    if (!jobId.success)
      throw new ApiError(400, "Choose a role to review.", "INVALID_ROLE");
    const { supabase, user } = await requireSession();
    const { data: job } = await supabase
      .from("jobs")
      .select("organisation_id")
      .eq("id", jobId.data)
      .maybeSingle();
    if (!job)
      throw new ApiError(
        404,
        "This role could not be found.",
        "ROLE_NOT_FOUND",
      );
    const { data: membership, error: membershipError } = await supabase
      .from("organisation_members")
      .select("role")
      .eq("organisation_id", job.organisation_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError)
      throw new ApiError(
        503,
        "We could not verify your hiring permissions.",
        "PERMISSIONS_UNAVAILABLE",
      );
    if (
      !membership ||
      !["owner", "admin", "recruiter"].includes(membership.role)
    )
      throw new ApiError(
        403,
        "You cannot review applications for this role.",
        "HIRING_ACCESS_REQUIRED",
      );
    const { data, error } = await supabase.rpc("list_job_applications", {
      p_job_id: jobId.data,
    });
    if (error)
      throw new ApiError(
        503,
        "Applications are temporarily unavailable.",
        "APPLICATIONS_UNAVAILABLE",
      );
    // Merely loading a list must never count as opening an application.
    return json({ applications: data || [] });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { applicationId } = await parseBody(
      request,
      z.object({ applicationId: z.uuid() }).strict(),
      2_000,
    );
    const { supabase } = await requireSession();
    // RPC atomically rechecks current membership, records an intentional first open and returns the private snapshot.
    const { data, error } = await supabase.rpc("open_application", {
      p_application_id: applicationId,
    });
    if (error?.code === "42501")
      throw new ApiError(
        403,
        "You cannot open this application.",
        "HIRING_ACCESS_REQUIRED",
      );
    if (error)
      throw new ApiError(
        503,
        "This application is temporarily unavailable.",
        "APPLICATION_UNAVAILABLE",
      );
    return json({ application: data });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(
      request,
      z
        .object({
          applicationId: z.uuid(),
          status: z.enum([
            "shortlisted",
            "interview",
            "offer",
            "not_proceeding",
          ]),
          message: z
            .string()
            .trim()
            .min(10, "Write a useful update for this candidate.")
            .max(4_000),
        })
        .strict(),
      8_000,
    );
    const { supabase } = await requireSession();
    const { data, error } = await supabase.rpc("update_application_stage", {
      p_application_id: body.applicationId,
      p_status: body.status,
      p_message: body.message,
    });
    if (error?.code === "42501")
      throw new ApiError(
        403,
        "You cannot update this application.",
        "HIRING_ACCESS_REQUIRED",
      );
    if (error?.code === "22023")
      throw new ApiError(
        400,
        "Check the stage and message. Withdrawn applications cannot be updated.",
        "INVALID_APPLICATION_UPDATE",
      );
    if (error)
      throw new ApiError(
        503,
        "Your update was not saved. Please try again.",
        "APPLICATION_UPDATE_FAILED",
      );
    return json({
      eventId: data,
      message: "The candidate’s application timeline has been updated.",
    });
  } catch (error) {
    return apiError(error);
  }
}
