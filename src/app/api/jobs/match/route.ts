import { PremiumError, premiumError } from "@/lib/premium/http";
import { assertCareerTools } from "@/lib/server/business";
import { z } from "zod";
import { getPublicJobs, parseJobQuery } from "@/lib/jobs-server";
import { cvMatch, filterJobs } from "@/lib/search";
import { getSessionContext } from "@/lib/server/auth";
import {
  ApiError,
  apiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";
const bodySchema = z
  .object({
    query: z.string().max(2000),
    additionalExperience: z.string().trim().max(4000).default(""),
    consent: z.literal(true),
    page: z.number().int().min(1).max(100).default(1),
    strongOnly: z.boolean().default(true),
    sort: z
      .enum(["relevance", "newest", "salary-high", "response-fast", "match"])
      .default("match"),
  })
  .strict();

/** Private CV comparison: never put CVs in query strings, logs or persistent storage. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase, user, isPremium, business } = await getSessionContext();
    if (!supabase)
      throw new ApiError(
        503,
        "CV matching is being configured. Please check back soon.",
        "SERVICE_NOT_CONFIGURED",
      );
    if (!user)
      throw new ApiError(
        401,
        "Sign in to compare your CV with roles.",
        "SIGN_IN_REQUIRED",
      );
    assertCareerTools(business, isPremium);
    if (!isPremium)
      throw new ApiError(
        403,
        "CV matching is included with Careers+.",
        "PREMIUM_REQUIRED",
      );
    const input = await parseBody(request, bodySchema, 85000);
    const profile = await supabase
      .from("profiles")
      .select("active_cv_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile.error)
      throw new ApiError(503, "Your base CV could not be checked.");
    if (!profile.data?.active_cv_id)
      throw new ApiError(
        409,
        "Upload and select a base CV on your profile to use Strong CV matches.",
        "BASE_CV_REQUIRED",
      );
    const saved = await supabase
      .from("candidate_cvs")
      .select("extracted_text")
      .eq("id", profile.data.active_cv_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (saved.error)
      throw new ApiError(503, "Your base CV could not be loaded.");
    if (!saved.data?.extracted_text)
      throw new ApiError(
        409,
        "Choose a readable base CV on your profile.",
        "BASE_CV_REQUIRED",
      );
    const cv = saved.data.extracted_text as string;
    const filters = parseJobQuery(new URLSearchParams(input.query));
    const inventory = await getPublicJobs({
      ...filters,
      page: 1,
      pageSize: 200,
    });
    if (inventory.error) return json(inventory, 503);
    const eligible = inventory.jobs
      .map((job) => ({
        job,
        match: cvMatch(job, cv, input.additionalExperience),
      }))
      .filter((item) => !input.strongOnly || item.match.score >= 0.6);
    const matched = filterJobs(
      eligible.map((item) => item.job),
      {
        sort: input.sort,
        cvText: cv,
        additionalExperience: input.additionalExperience,
      },
    );
    const evidence = Object.fromEntries(
      eligible.map((item) => [item.job.id, item.match]),
    );
    const pageSize = 12;
    return json({
      jobs: matched.slice((input.page - 1) * pageSize, input.page * pageSize),
      matches: evidence,
      source: inventory.source,
      total: matched.length,
      page: input.page,
      pageSize,
      searchedCount: inventory.jobs.length,
      searchTotal: inventory.total,
    });
  } catch (error) {
    if (error instanceof PremiumError) return premiumError(error);
    return apiError(error);
  }
}
