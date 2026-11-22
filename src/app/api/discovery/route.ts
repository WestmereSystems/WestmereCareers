import { getSessionContext } from "@/lib/server/auth";
import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { discoveryKeyword, discoveryRegion } from "@/lib/discovery";
import { premiumAdmin } from "@/lib/premium/providers";
import { apiError, assertSameOrigin, json, parseBody } from "@/lib/server/http";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (
      (await cookies()).get("westmere-analytics")?.value !== "allow" ||
      request.headers.get("sec-gpc") === "1" ||
      /bot|crawler|spider|headless/i.test(
        request.headers.get("user-agent") || "",
      ) ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    )
      return json({ recorded: false });
    const b = await parseBody(
      request,
      z
        .object({
          view: z.uuid(),
          jobId: z.uuid().optional(),
          organisations: z.array(z.uuid()).min(1).max(24),
          kind: z.enum(["search", "listing", "profile"]),
          keyword: z.string().max(80).default(""),
        })
        .strict(),
      2500,
    );
    const context = await getSessionContext();
    if (context.business) return json({ recorded: false });
    if (context.user && context.supabase) {
      const { data: role } = await context.supabase.rpc("my_staff_role");
      if (role) return json({ recorded: false });
    }
    const forwarded = (request.headers.get("x-vercel-forwarded-for") || "")
      .split(",")[0]
      .trim();
    const network = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY)
      .update(
        `discovery-abuse:${new Date().toISOString().slice(0, 10)}:${isIP(forwarded) ? forwarded : "unknown"}`,
      )
      .digest("hex");
    const admin = premiumAdmin();
    const { data: recorded, error } = await admin.rpc("record_discovery_view", {
      p_view: b.view,
      p_orgs: [...new Set(b.organisations)],
      p_kind: b.kind,
      p_region: discoveryRegion(request.headers, process.env.VERCEL === "1"),
      p_keyword: discoveryKeyword(b.keyword),
      p_network: network,
    });
    if (
      !error &&
      recorded &&
      b.kind === "search" &&
      discoveryKeyword(b.keyword)
    )
      await admin.rpc("record_site_search", {
        p_view: b.view,
        p_keyword: discoveryKeyword(b.keyword),
        p_network: network,
      });
    if (!error && b.kind === "listing" && b.jobId)
      await premiumAdmin().rpc("record_job_view", {
        p_view: b.view,
        p_job: b.jobId,
      });
    return json({ recorded: !error });
  } catch (e) {
    return apiError(e);
  }
}

export async function GET() {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ searches: [] });
    const { data, error } = await premiumAdmin().rpc("popular_site_searches");
    if (error) return json({ searches: [] });
    return json({
      searches: Array.isArray(data)
        ? data
            .filter(
              (term): term is string =>
                typeof term === "string" && discoveryKeyword(term) === term,
            )
            .slice(0, 6)
        : [],
    });
  } catch {
    return json({ searches: [] });
  }
}
