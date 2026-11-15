import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { ApiError, apiError, json } from "@/lib/server/http";
import {
  summariseHiring,
  type HiringApplication,
  type HiringRole,
} from "@/lib/hiring-statistics";

export const dynamic = "force-dynamic";
const filters = z.object({
  days: z.enum(["30", "90", "365"]).default("30"),
  organisation: z.uuid().optional(),
  job: z.uuid().optional(),
});
async function allRows<T>(
  page: (
    start: number,
    end: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < 20_000; start += 1000) {
    const { data, error } = await page(start, start + 999);
    if (error)
      throw new ApiError(
        503,
        "Hiring statistics could not be loaded. Please try again.",
      );
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return rows;
  }
  throw new ApiError(
    422,
    "This selection contains too much activity. Choose a shorter period or a specific role.",
  );
}
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireSession();
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const result = filters.safeParse(params);
    if (!result.success)
      throw new ApiError(
        400,
        "Choose a valid statistics period, business and role.",
      );
    const { days: period, organisation, job } = result.data;
    const days = Number(period);
    const now = Date.now();
    const { data: memberships, error } = await supabase
      .from("organisation_members")
      .select(
        "organisation_id,role,organisations(name,is_verified,suspended_at)",
      )
      .eq("user_id", user.id)
      .in("role", ["owner", "admin", "recruiter"]);
    if (error)
      throw new ApiError(503, "Your hiring permissions could not be verified.");
    const businesses = (memberships ?? []).flatMap((member) => {
      const business = Array.isArray(member.organisations)
        ? member.organisations[0]
        : member.organisations;
      return business?.is_verified && !business.suspended_at
        ? [{ id: member.organisation_id, name: business.name }]
        : [];
    });
    if (
      organisation &&
      !businesses.some((business) => business.id === organisation)
    )
      throw new ApiError(
        403,
        "Hiring statistics are only available for your active, verified businesses.",
      );
    const ids = organisation
      ? [organisation]
      : businesses.map((business) => business.id);
    if (!ids.length)
      return json({
        statistics: summariseHiring([], [], days, now),
        businesses,
        roles: [],
      });
    const roles = await allRows<HiringRole>((start, end) =>
      supabase
        .from("jobs")
        .select("id,title,organisation_id,status,published_at,expires_at")
        .in("organisation_id", ids)
        .order("id")
        .range(start, end),
    );
    if (job && !roles.some((role) => role.id === job))
      throw new ApiError(
        403,
        "This role is outside your selected hiring workspace.",
      );
    const selected = job ? roles.filter((role) => role.id === job) : roles;
    const roleIds = selected.map((role) => role.id);
    // Read only dates, stages and event types. No CVs, identities, answers or messages are fetched.
    // Withdrawn material remains excluded under the application's existing RLS and withdrawal contract.
    const applications: HiringApplication[] = [];
    for (let offset = 0; offset < roleIds.length; offset += 100) {
      const batch = await allRows<HiringApplication>((start, end) =>
        supabase
          .from("applications")
          .select(
            "id,job_id,status,created_at,application_events(event_type,occurred_at)",
          )
          .in("job_id", roleIds.slice(offset, offset + 100))
          .is("withdrawn_at", null)
          .gte(
            "created_at",
            new Date(now - days * 2 * 86_400_000).toISOString(),
          )
          .lte("created_at", new Date(now).toISOString())
          .order("created_at")
          .order("id")
          .range(start, end),
      );
      applications.push(...batch);
      if (applications.length > 20_000)
        throw new ApiError(
          422,
          "Choose a shorter period or a specific role to view these statistics.",
        );
    }
    return json({
      statistics: summariseHiring(selected, applications, days, now),
      businesses,
      roles: roles.map(({ id, title }) => ({ id, title })),
    });
  } catch (error) {
    return apiError(error);
  }
}
