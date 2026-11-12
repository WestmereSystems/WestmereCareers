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
const input = z
  .object({
    jobId: z.uuid(),
    cvText: z
      .string()
      .trim()
      .min(50, "Add your CV before submitting.")
      .max(40_000),
    coverLetter: z.string().trim().max(15_000).default(""),
    answers: z.record(z.string().max(100), z.string().max(4_000)).default({}),
    consent: z.literal(true, {
      error:
        "Confirm that you want to share this application with the employer.",
    }),
  })
  .strict();

export async function GET() {
  try {
    const { supabase, user } = await requireSession();
    // Deliberately exclude private CV content from the application-list response.
    const { data, error } = await supabase
      .from("applications")
      .select(
        "id,job_id,status,created_at,withdrawn_at,job_title_snapshot,company_snapshot,location_snapshot,jobs(title,company,location,source),application_events(id,event_type,source,message,occurred_at)",
      )
      .eq("candidate_id", user.id)
      .order("created_at", { ascending: false })
      .order("occurred_at", {
        referencedTable: "application_events",
        ascending: true,
      })
      .limit(100);
    if (error)
      throw new ApiError(
        503,
        "Your applications are temporarily unavailable.",
        "APPLICATIONS_UNAVAILABLE",
      );
    return json({ applications: data || [] });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(request, input);
    const { supabase, user } = await requireSession();
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id,source,status,published_at,expires_at")
      .eq("id", body.jobId)
      .maybeSingle();
    if (jobError)
      throw new ApiError(
        503,
        "This role is temporarily unavailable.",
        "ROLE_UNAVAILABLE",
      );
    const now = Date.now();
    if (
      !job ||
      job.status !== "published" ||
      Date.parse(job.published_at) > now ||
      Date.parse(job.expires_at) <= now
    ) {
      throw new ApiError(
        410,
        "This role is no longer accepting applications.",
        "ROLE_CLOSED",
      );
    }
    if (job.source !== "direct")
      throw new ApiError(
        400,
        "Apply for this role on the employer website. Westmere cannot track an external submission.",
        "EXTERNAL_APPLICATION",
      );
    const { data, error } = await supabase
      .from("applications")
      .insert({
        job_id: job.id,
        candidate_id: user.id,
        cv_text_snapshot: body.cvText,
        cover_letter: body.coverLetter,
        answers: body.answers,
      })
      .select("id,created_at,status")
      .single();
    if (error?.code === "23505")
      throw new ApiError(
        409,
        "You have already applied for this role.",
        "ALREADY_APPLIED",
      );
    if (error)
      throw new ApiError(
        503,
        "Your application was not submitted. Please try again.",
        "APPLICATION_NOT_SUBMITTED",
      );
    // The receipt event is inserted in the same database transaction by a trigger.
    return json(
      { application: data, message: "Your application has been received." },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const { applicationId } = await parseBody(
      request,
      z.object({ applicationId: z.uuid() }).strict(),
      2_000,
    );
    const { supabase, user } = await requireSession();
    const { data, error } = await supabase
      .from("applications")
      .update({ withdrawn_at: new Date().toISOString() })
      .eq("id", applicationId)
      .eq("candidate_id", user.id)
      .is("withdrawn_at", null)
      .select("id,withdrawn_at")
      .maybeSingle();
    if (error)
      throw new ApiError(
        503,
        "Your application could not be withdrawn. Please try again.",
        "WITHDRAWAL_FAILED",
      );
    if (!data)
      throw new ApiError(
        404,
        "No active application was found.",
        "APPLICATION_NOT_FOUND",
      );
    return json({
      application: data,
      message: "Your application has been withdrawn.",
    });
  } catch (error) {
    return apiError(error);
  }
}
