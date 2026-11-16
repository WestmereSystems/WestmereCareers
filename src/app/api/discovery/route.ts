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
          organisations: z.array(z.uuid()).min(1).max(24),
          kind: z.enum(["search", "listing", "profile"]),
          keyword: z.string().max(80).default(""),
        })
        .strict(),
      2500,
    );
    const forwarded = (request.headers.get("x-vercel-forwarded-for") || "")
      .split(",")[0]
      .trim();
    const network = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY)
      .update(
        `discovery-abuse:${new Date().toISOString().slice(0, 10)}:${isIP(forwarded) ? forwarded : "unknown"}`,
      )
      .digest("hex");
    const { error } = await premiumAdmin().rpc("record_discovery", {
      p_orgs: [...new Set(b.organisations)],
      p_kind: b.kind,
      p_region: discoveryRegion(request.headers, process.env.VERCEL === "1"),
      p_keyword: discoveryKeyword(b.keyword),
      p_network: network,
    });
    return json({ recorded: !error });
  } catch (e) {
    return apiError(e);
  }
}
