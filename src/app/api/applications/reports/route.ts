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
        "Check the employer, application date and response date.",
        "INVALID_REPORT",
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
    return json(
      {
        reportId: data,
        message:
          "Your experience has been recorded privately for review. It is not published automatically.",
      },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
