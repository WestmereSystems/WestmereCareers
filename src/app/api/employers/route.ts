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

export const dynamic = "force-dynamic";
const input = z
  .object({
    id: z.uuid().optional(),
    organisationId: z.uuid(),
    title: z.string().trim().min(3).max(180),
    location: z.string().trim().min(2).max(180),
    city: z.string().trim().min(2).max(100),
    state: z.enum(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]),
    category: z.string().trim().min(2).max(100),
    workMode: z.enum(["On-site", "Hybrid", "Remote"]),
    employmentType: z.enum(["Full time", "Part time", "Contract", "Casual"]),
    salaryMin: moneyAmount,
    salaryMax: moneyAmount,
    salaryPeriod: z.enum(["year", "hour"]).default("year"),
    superIncluded: z.boolean().default(false),
    description: z.string().trim().min(20).max(20_000),
    responsibilities: z.array(z.string().trim().max(1000)).max(30).default([]),
    requirements: z.array(z.string().trim().max(1000)).max(30).default([]),
    skills: z.array(z.string().trim().max(100)).max(30).default([]),
    publish: z.boolean().default(false),
  })
  .strict()
  .refine((value) => value.salaryMax >= value.salaryMin, {
    message: "Maximum salary must be at least the minimum salary.",
  });

export async function GET() {
  try {
    const { supabase, user } = await requireSession();
    const { data: memberships, error } = await supabase
      .from("organisation_members")
      .select(
        "organisation_id,role,organisations(id,name,slug,is_verified,suspended_at)",
      )
      .eq("user_id", user.id);
    if (error)
      throw new ApiError(
        503,
        "Your hiring workspace is temporarily unavailable.",
        "WORKSPACE_UNAVAILABLE",
      );
    const organisationIds = (memberships || []).map(
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
        "id,organisation_id,title,status,location,city,state,category,work_mode,employment_type,salary_min,salary_max,salary_period,super_included,description,responsibilities,requirements,skills,created_at,expires_at,moderation_status,publication_requested,listing_review_feedback(message)",
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
    return json({ memberships, jobs: jobs || [] });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(request, input);
    const { supabase, user } = await requireSession();
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
      .select("name,is_verified,suspended_at")
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
    const values = {
      organisation_id: body.organisationId,
      title: body.title,
      company: organisation.name,
      location: body.location,
      city: body.city,
      state: body.state,
      category: body.category,
      work_mode: body.workMode,
      employment_type: body.employmentType,
      salary_min: body.salaryMin,
      salary_max: body.salaryMax,
      salary_period: body.salaryPeriod,
      super_included: body.superIncluded,
      salary_note: body.superIncluded ? "includes super" : "+ super",
      description: body.description,
      responsibilities: body.responsibilities,
      requirements: body.requirements,
      skills: body.skills,
      source: "direct",
      status: "draft",
      publication_requested: body.publish,
    };
    const write = body.id
      ? supabase
          .from("jobs")
          .update(values)
          .eq("id", body.id)
          .eq("organisation_id", body.organisationId)
      : supabase.from("jobs").insert(values);
    const { data, error } = await write.select("id,title,status").single();
    if (error)
      throw new ApiError(
        503,
        "Your role could not be saved. Please try again.",
        "ROLE_SAVE_FAILED",
      );
    return json(
      {
        job: data,
        message: body.publish
          ? "Your role was submitted for independent review. It will appear after approval."
          : "Your role draft is saved. Edited listings need review before publication.",
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
      z.object({ id: z.uuid(), action: z.enum(["submit", "close"]) }).strict(),
      1000,
    );
    const { supabase } = await requireSession();
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
          ? "Listing closed."
          : "Listing submitted for independent review.",
    });
  } catch (error) {
    return apiError(error);
  }
}
