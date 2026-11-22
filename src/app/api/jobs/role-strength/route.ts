import { PremiumError, premiumError } from "@/lib/premium/http";
import { assertCareerTools } from "@/lib/server/business";
import { z } from "zod";
import { getSessionContext } from "@/lib/server/auth";
import { getPublicJobs } from "@/lib/jobs-server";
import {
  ApiError,
  apiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
import {
  roleStrength,
  compareRoleStrength,
  suggestedRoleTitle,
  type RoleStrengthMatch,
} from "@/lib/role-strength";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user, supabase, isPremium, business } = await getSessionContext();
    if (!supabase)
      throw new ApiError(
        503,
        "Role Strength is being configured. Please try again shortly.",
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
        "Role Strength is included with Careers+.",
        "PREMIUM_REQUIRED",
      );
    const input = await parseBody(
      request,
      z
        .object({
          role: z.string().trim().max(120),
          cv: z.string().trim().min(40).max(24000),
          coverLetter: z.string().max(15000).default(""),
        })
        .strict(),
      160000,
    );
    const started = Date.now();
    const top: RoleStrengthMatch[] = [];
    const recommendations = new Map<
      string,
      { title: string; score: number; count: number }
    >();
    let searched = 0,
      total = 0,
      page = 1,
      source: "live" | "demo" = "live";
    do {
      request.signal.throwIfAborted();
      if (Date.now() - started > 45000)
        throw new ApiError(
          503,
          "This search is taking longer than expected. Choose a more specific position type and try again.",
        );
      const inventory = await getPublicJobs({
        keyword: input.role || undefined,
        page,
        pageSize: 200,
        sort: "newest",
      });
      if (inventory.error) throw new ApiError(503, inventory.error);
      total = inventory.total;
      source = inventory.source;
      if (!inventory.jobs.length) break;
      for (const job of inventory.jobs) {
        const measure = roleStrength(job, input.cv, input.coverLetter);
        top.push({ job, measure });
        top.sort(compareRoleStrength);
        if (top.length > 10) top.pop();
        if (measure.score !== null && measure.score > 0) {
          const title = suggestedRoleTitle(job.title),
            key = title.toLowerCase();
          const existing = recommendations.get(key);
          recommendations.set(key, {
            title,
            score: Math.max(existing?.score || 0, measure.score),
            count: (existing?.count || 0) + 1,
          });
        }
      }
      searched += inventory.jobs.length;
      page++;
    } while (searched < total);
    return json({
      matches: top,
      recommendedRoles: [...recommendations.values()]
        .sort(
          (a, b) =>
            b.score - a.score ||
            b.count - a.count ||
            a.title.localeCompare(b.title),
        )
        .slice(0, 6),
      searchedCount: searched,
      total,
      source,
      role: input.role,
    });
  } catch (error) {
    return error instanceof PremiumError
      ? premiumError(error)
      : apiError(error);
  }
}
