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
    cv: z.string().min(40).max(20000),
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
    const { supabase, user, isPremium } = await getSessionContext();
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
    if (!isPremium)
      throw new ApiError(
        403,
        "CV matching is included with Careers+.",
        "PREMIUM_REQUIRED",
      );
    const input = await parseBody(request, bodySchema, 85000);
    const filters = parseJobQuery(new URLSearchParams(input.query));
    const inventory = await getPublicJobs({
      ...filters,
      page: 1,
      pageSize: 200,
    });
    if (inventory.error) return json(inventory, 503);
    const eligible = inventory.jobs
      .map((job) => ({ job, match: cvMatch(job, input.cv) }))
      .filter((item) => !input.strongOnly || item.match.score >= 0.6);
    const matched = filterJobs(
      eligible.map((item) => item.job),
      { sort: input.sort, cvText: input.cv },
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
    return apiError(error);
  }
}
