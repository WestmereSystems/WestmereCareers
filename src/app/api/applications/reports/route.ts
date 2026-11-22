import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import {
  ApiError,
  apiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
import { checkRpc } from "@/lib/server/trust";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireSession();
    const organisationId = new URL(request.url).searchParams.get(
      "organisationId",
    );
    if (organisationId) {
      if (!z.uuid().safeParse(organisationId).success)
        throw new ApiError(400, "Choose a business.");
      const result = await supabase.rpc("response_report_roles", {
        p_org: organisationId,
      });
      checkRpc(result.error);
      return json({ roles: result.data || [] });
    }
    const { data, error } = await supabase
      .from("response_reports")
      .select(
        "id,organisation_id,application_id,job_reference,application_date,response_received,confirmed_at,moderation_status,corroborated",
      )
      .eq("candidate_id", user.id)
      .order("confirmed_at", { ascending: false })
      .limit(100);
    checkRpc(error);
    return json({ reports: data });
  } catch (error) {
    return apiError(error);
  }
}
const input = z
  .object({
    applicationId: z.uuid().optional(),
    organisationId: z.uuid().optional(),
    jobReference: z.string().trim().min(3).max(300).optional(),
    applicationDate: z.iso.datetime({ offset: true }).optional(),
    responseReceived: z.boolean(),
    responseDate: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.applicationId ||
      (value.organisationId && value.jobReference && value.applicationDate),
    {
      message:
        "Choose your application or add the employer and application details.",
    },
  );

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(request, input, 4_000);
    const { supabase } = await requireSession();
    const { data, error } = await supabase.rpc("submit_response_report", {
      p_application_id: body.applicationId || null,
      p_organisation_id: body.organisationId || null,
      p_job_reference: body.jobReference || null,
      p_application_date: body.applicationDate || null,
      p_response_received: body.responseReceived,
      p_response_date: body.responseDate || null,
    });
    if (error?.code === "42501")
      throw new ApiError(
        403,
        "You can report only your own application experience.",
        "APPLICATION_ACCESS_REQUIRED",
      );
    if (error?.code === "22023")
      throw new ApiError(
        400,
        "Select a published position and check the application and response dates.",
        "INVALID_REPORT",
      );
    if (error?.code === "23505")
      throw new ApiError(
        409,
        "You have already reviewed this job title for this business.",
        "ROLE_ALREADY_REVIEWED",
      );
    if (error?.code === "P0001")
      throw new ApiError(
        429,
        "Please wait before submitting more reports.",
        "REPORT_LIMIT_REACHED",
      );
    if (error)
      throw new ApiError(
        503,
        "Your report was not saved. Please try again.",
        "REPORT_NOT_SAVED",
      );
    const saved = await supabase
      .from("response_reports")
      .select("corroborated")
      .eq("id", data)
      .maybeSingle();
    return json(
      {
        reportId: data,
        message: saved.data?.corroborated
          ? "Your experience agrees with the recorded application activity and has been affirmed. On-site statistics use the recorded activity."
          : "Your experience was recorded privately. Off-site reports are self-reported and reviewed. On-site statistics continue to use recorded activity.",
      },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const { reportId } = await parseBody(
      request,
      z.object({ reportId: z.uuid() }).strict(),
      1000,
    );
    const { supabase } = await requireSession();
    const result = await supabase.rpc("confirm_response_report", {
      p_report: reportId,
    });
    checkRpc(result.error);
    return json({
      message:
        "Your existing no-response report has been reconfirmed. No additional review was created.",
    });
  } catch (error) {
    return apiError(error);
  }
}
