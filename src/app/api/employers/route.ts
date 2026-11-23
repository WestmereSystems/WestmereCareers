import terms from "@/content/terms-and-conditions.json";
import { findPlace } from "@/lib/locations";
import { assertBusinessTerms } from "@/lib/server/business";
import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import {
  ApiError,
  apiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
import { moneyAmount } from "@/lib/server/validation";
import { externalApplicationTarget } from "@/lib/external-applications";

function businessKind(value: unknown) {
  const o = Array.isArray(value) ? value[0] : value;
  return (o as { kind?: string } | null)?.kind;
}
export const dynamic = "force-dynamic";
const input = z
  .object({
    id: z.uuid().optional(),
    organisationId: z.uuid(),
    agencyMode: z.enum(["internal", "client"]).optional(),
    authorisationId: z.uuid().nullable().optional(),
    leadUserId: z.uuid().optional(),
    recruitmentLead: z.string().trim().min(2).max(180).optional(),
    title: z.string().trim().min(3).max(180),
    location: z.string().trim().min(2).max(180),
    city: z.string().trim().min(2).max(100),
    state: z.enum(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]),
    category: z.string().trim().min(2).max(100),
    workMode: z.enum(["On-site", "Hybrid", "Remote"]),
    employmentType: z.enum(["Full time", "Part time", "Contract", "Casual"]),
    salaryMin: moneyAmount.nullable().default(null),
    salaryMax: moneyAmount.nullable().default(null),
    salaryPeriod: z.enum(["year", "hour"]).default("year"),
    superIncluded: z.boolean().default(false),
    contentLabels: z
      .object({
        about: z.string().trim().min(1).max(100).optional(),
        responsibilities: z.string().trim().min(1).max(100).optional(),
        requirements: z.string().trim().min(1).max(100).optional(),
        skills: z.string().trim().min(1).max(100).optional(),
      })
      .strict()
      .optional(),
    description: z.string().trim().min(20).max(20_000),
    responsibilities: z.array(z.string().trim().max(1000)).max(30).default([]),
    requirements: z.array(z.string().trim().max(1000)).max(30).default([]),
    skills: z.array(z.string().trim().max(100)).max(30).default([]),
    contactEmail: z.union([z.email().max(254), z.literal("")]).default(""),
    source: z.enum(["direct", "external"]).default("direct"),
    externalUrl: z.string().trim().max(2000).default(""),
    publish: z.boolean().default(false),
    complianceConfirmed: z.boolean().default(false),
    expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.source === "external" &&
      !externalApplicationTarget(value.externalUrl)
    )
      context.addIssue({
        code: "custom",
        path: ["externalUrl"],
        message:
          "Enter a full HTTPS application URL on an external website, without embedded credentials or a local address.",
      });
    if (value.source === "direct" && value.externalUrl)
      context.addIssue({
        code: "custom",
        path: ["externalUrl"],
        message: "Remove the external URL when candidates apply on Westmere.",
      });
  })
  .refine(
    (value) =>
      (value.salaryMin === null && value.salaryMax === null) ||
      (value.salaryMin !== null &&
        value.salaryMax !== null &&
        value.salaryMax >= value.salaryMin),
    {
      message:
        "Leave both salary amounts blank, or provide a complete range with maximum at least minimum.",
    },
  );

export async function GET() {
  try {
    const { supabase, user } = await requireSession();
    const { data: memberships, error } = await supabase
      .from("organisation_members")
      .select(
        "organisation_id,role,organisations(id,name,slug,is_test,is_verified,suspended_at,kind,description,careers_email,avatar_path,banner_path,website,social_links)",
      )
      .eq("user_id", user.id);
    if (error)
      throw new ApiError(
        503,
        "Your hiring workspace is temporarily unavailable.",
        "WORKSPACE_UNAVAILABLE",
      );
    const visibleMemberships = (memberships || []).filter(
      (m) => m.organisations,
    );
    const organisationIds = visibleMemberships.map(
      (item) => item.organisation_id,
    );
    if (!organisationIds.length)
      return json({
        memberships: [],
        jobs: [],
        message:
          "Your employer account needs business ownership review before roles can be published.",
      });
    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select(
        "id,organisation_id,agency_hiring_mode,client_label,recruitment_lead,title,status,location,city,state,category,work_mode,employment_type,content_labels,salary_min,salary_max,salary_period,super_included,description,responsibilities,requirements,skills,created_at,published_at,expires_at,moderation_status,publication_requested,contact_email,source,external_url,listing_documents(id,filename,bytes),listing_review_feedback(message)",
      )
      .in("organisation_id", organisationIds)
      .order("created_at", { ascending: false })
      .limit(100);
    if (jobsError)
      throw new ApiError(
        503,
        "Your roles are temporarily unavailable.",
        "WORKSPACE_UNAVAILABLE",
      );
    const overview = await supabase.rpc("role_overview");
    if (overview.error)
      throw new ApiError(503, "Role activity could not be loaded.");
    return json({
      memberships: visibleMemberships,
      jobs: (jobs || []).filter(
        (j) =>
          visibleMemberships.find(
            (m) => m.organisation_id === j.organisation_id,
          )?.organisations &&
          (businessKind(
            visibleMemberships.find(
              (m) => m.organisation_id === j.organisation_id,
            )?.organisations,
          ) !== "agency" ||
            (overview.data || []).some((o: { id: string }) => o.id === j.id)),
      ),
      overview: overview.data || [],
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
    if (body.publish && !body.complianceConfirmed)
      throw new ApiError(
        400,
        "Confirm your authority and checks of lawful pay, recruitment and required licences before publishing.",
        "LISTING_COMPLIANCE_REQUIRED",
      );
    assertBusinessTerms(business);
    const { data: membership, error: membershipError } = await supabase
      .from("organisation_members")
      .select("role")
      .eq("organisation_id", body.organisationId)
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
        "You do not have permission to publish roles for this business.",
        "HIRING_ACCESS_REQUIRED",
      );
    const { data: organisation, error: organisationError } = await supabase
      .from("organisations")
      .select("name,is_verified,suspended_at,kind")
      .eq("id", body.organisationId)
      .single();
    if (organisationError)
      throw new ApiError(
        503,
        "We could not load your business details.",
        "BUSINESS_UNAVAILABLE",
      );
    if (
      organisation.suspended_at ||
      (body.publish && !organisation.is_verified)
    )
      throw new ApiError(
        403,
        "Business ownership review must be complete before publishing.",
        "VERIFICATION_REQUIRED",
      );
    if (organisation.kind === "agency" && membership.role === "recruiter") {
      if (
        !body.id ||
        body.agencyMode ||
        body.authorisationId ||
        body.leadUserId ||
        body.recruitmentLead
      )
        throw new ApiError(
          403,
          "Agency administrators create vacancies and manage their client and recruiter assignments.",
        );
      const access = await supabase.rpc("can_access_hiring_job", {
        p_job: body.id,
        p_action: "listing",
      });
      if (access.error || access.data !== true)
        throw new ApiError(403, "Choose an assigned agency vacancy.");
    }
    const place = findPlace(body.city, body.state);
    const values = {
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
      title: body.title,
      ...(body.expiresAt ? { expires_at: body.expiresAt } : {}),
      company: organisation.name,
      location: body.location,
      city: body.city,
      state: body.state,
      category: body.category,
      work_mode: body.workMode,
      employment_type: body.employmentType,
      ...(body.contentLabels ? { content_labels: body.contentLabels } : {}),
      salary_min: body.salaryMin,
      salary_max: body.salaryMax,
      salary_period: body.salaryPeriod,
      super_included: body.superIncluded,
      salary_note: body.superIncluded ? "includes super" : "+ super",
      description: body.description,
      responsibilities: body.responsibilities,
      requirements: body.requirements,
      skills: body.skills,
      contact_email: body.contactEmail || null,
      source: body.source,
      external_url:
        body.source === "external"
          ? externalApplicationTarget(body.externalUrl)!.href
          : null,
      compliance_confirmed_at: body.complianceConfirmed
        ? new Date().toISOString()
        : null,
      compliance_version: body.complianceConfirmed ? terms.version : null,
      status: "draft",
      publication_requested:
        organisation.kind === "agency" && membership.role !== "recruiter"
          ? false
          : body.publish,
    };
    const write = body.id
      ? supabase
          .from("jobs")
          .update(values)
          .eq("id", body.id)
          .eq("organisation_id", body.organisationId)
      : supabase
          .from("jobs")
          .insert({ ...values, organisation_id: body.organisationId });
    const { data, error } = await write.select("id,title,status").single();
    if (error)
      throw new ApiError(
        error.code === "23514" ? 409 : 503,
        error.code === "23514"
          ? error.message
          : "Your role could not be saved. Please try again.",
        "ROLE_SAVE_FAILED",
      );
    if (organisation.kind === "agency" && membership.role !== "recruiter") {
      const configured = await supabase.rpc("manage_agency", {
        p_action: "configure_job",
        p_org: body.organisationId,
        p_details: {
          jobId: data.id,
          mode: body.agencyMode || "internal",
          authorisationId: body.authorisationId || null,
          leadUserId: body.leadUserId || user.id,
          leadName: body.recruitmentLead || business?.tradingName,
          publish: body.publish,
        },
      });
      if (configured.error)
        throw new ApiError(
          configured.error.code === "42501" ? 403 : 409,
          `Draft saved. ${configured.error.message}`,
        );
    }
    return json(
      {
        job: data,
        message: body.publish
          ? data.status === "published"
            ? "Your role is published. The moderation team has been notified."
            : "This listing remains restricted by moderation. Review its feedback before requesting reinstatement."
          : "Your private role draft is saved.",
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
    const body = await parseBody(
      request,
      z
        .object({ id: z.uuid(), action: z.enum(["submit", "close", "renew"]) })
        .strict(),
      1000,
    );
    const { supabase, business } = await requireSession();
    assertBusinessTerms(business);
    if (body.action === "renew") {
      const { data, error } = await supabase.rpc("renew_listing", {
        p_job: body.id,
      });
      if (error)
        throw new ApiError(error.code === "42501" ? 403 : 400, error.message);
      return json({
        job: data,
        message:
          "Listing renewed for 40 days. Its ID, applications and statistics are unchanged. This renewal is logged.",
      });
    }
    const { data, error } = await supabase
      .from("jobs")
      .update(
        body.action === "close"
          ? { status: "closed", publication_requested: false }
          : { publication_requested: true },
      )
      .eq("id", body.id)
      .select("id,status,publication_requested")
      .maybeSingle();
    if (error || !data)
      throw new ApiError(
        403,
        "This listing could not be changed. Check your hiring permissions.",
      );
    return json({
      job: data,
      message:
        body.action === "close"
          ? "Listing archived. Applications and statistics are retained."
          : data.status === "published"
            ? "Listing published. The moderation team has been notified."
            : "This listing is restricted by moderation. Review its feedback.",
    });
  } catch (error) {
    return apiError(error);
  }
}
