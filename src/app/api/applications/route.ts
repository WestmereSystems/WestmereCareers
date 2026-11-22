import { jobFromRecord } from "@/lib/jobs-server";
import { premiumAdmin } from "@/lib/premium/providers";
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
    cvId: z.uuid().nullable().optional(),
    cvText: z
      .string()
      .trim()
      .min(50, "Add your CV before submitting.")
      .max(40_000),
    coverLetter: z.string().trim().max(15_000).default(""),
    testApplication: z.boolean().default(false),
    uploadIds: z.array(z.uuid()).max(8).default([]),
    rightToWork: z
      .enum([
        "not_provided",
        "au_citizen",
        "nz_citizen",
        "permanent_resident",
        "visa_full_rights",
        "visa_limited_rights",
        "require_sponsorship",
      ])
      .default("not_provided"),
    driversLicence: z
      .enum(["not_provided", "yes", "no"])
      .default("not_provided"),
    certifications: z.string().trim().max(2000).default(""),
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
        "listing_snapshot,id,job_id,status,created_at,withdrawn_at,job_title_snapshot,company_snapshot,location_snapshot,advertiser_kind_snapshot,client_label_snapshot,recipient_snapshot,jobs(title,company,location,source),application_events(id,event_type,source,message,occurred_at)",
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
    const retained = await supabase.rpc("my_retained_roles");
    if (retained.error)
      throw new ApiError(
        503,
        "Your application listing history is temporarily unavailable.",
      );
    const closed = new Map<string, boolean>(
      (retained.data || []).map((r: { id: string; closed: boolean }) => [
        r.id,
        r.closed,
      ]),
    );
    return json({
      applications: (data || []).map((a) => {
        const { listing_snapshot, ...rest } = a;
        return {
          ...rest,
          roleClosed: closed.get(a.job_id) ?? true,
          retainedListing: listing_snapshot
            ? jobFromRecord(listing_snapshot)
            : undefined,
        };
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(request, input);
    const { supabase, user, business } = await requireSession();
    if (business)
      throw new ApiError(
        403,
        "Use a separate personal account to apply for jobs. Business accounts are for managing hiring.",
        "INDIVIDUAL_ACCOUNT_REQUIRED",
      );
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id,source,status,published_at,expires_at,is_test")
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
    if (job.is_test && !body.testApplication)
      throw new ApiError(
        400,
        "Confirm this fictional test application uses synthetic details and documents.",
      );
    const applicationId = crypto.randomUUID();
    const admin = premiumAdmin();
    let document: {
      filename: string;
      path: string;
      mediaType: string;
      bytes: number;
    } | null = null;
    let submittedCv = body.cvText;
    if (body.cvId) {
      const { data: cv, error: cvError } = await supabase
        .from("candidate_cvs")
        .select("filename,storage_path,media_type,bytes,extracted_text")
        .eq("id", body.cvId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cvError || !cv)
        throw new ApiError(
          400,
          "Choose a CV from your own account or upload a new one.",
        );
      submittedCv = cv.extracted_text;
      const original = await admin.storage
        .from("candidate-documents")
        .download(cv.storage_path);
      if (original.error || !original.data)
        throw new ApiError(
          503,
          "Your CV file could not be attached. Please retry.",
        );
      const path = `${user.id}/${applicationId}.${cv.media_type === "application/pdf" ? "pdf" : "docx"}`;
      const copied = await admin.storage
        .from("application-documents")
        .upload(path, original.data, {
          contentType: cv.media_type,
          upsert: false,
        });
      if (copied.error)
        throw new ApiError(
          503,
          "Your CV file could not be attached. Please retry.",
        );
      document = {
        filename: cv.filename,
        path,
        mediaType: cv.media_type,
        bytes: cv.bytes,
      };
    }
    const { data, error } = await admin.rpc("submit_application_bundle", {
      p_id: applicationId,
      p_candidate: user.id,
      p_job: job.id,
      p_cv: submittedCv,
      p_letter: body.coverLetter,
      p_answers: {
        ...body.answers,
        right_to_work: body.rightToWork,
        drivers_licence: body.driversLicence,
        certifications: body.certifications,
      },
      p_uploads: body.uploadIds,
      p_document: document,
    });
    if (error && document)
      await admin.storage.from("application-documents").remove([document.path]);
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
