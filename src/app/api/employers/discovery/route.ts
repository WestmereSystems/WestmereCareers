import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { businessFor } from "@/lib/server/business";
import { hasDiscovery } from "@/lib/business";
import { premiumAdmin } from "@/lib/premium/providers";
import { apiError, ApiError, json } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireSession();
    const params = new URL(request.url).searchParams;
    const id = z.uuid().safeParse(params.get("organisation"));
    const days = z
      .enum(["30", "90", "365"])
      .safeParse(params.get("days") || "30");
    if (!id.success || !days.success)
      throw new ApiError(400, "Choose a business and reporting period.");
    const business = await businessFor(supabase, user.id);
    const org = business?.organisations.find(
      (o) =>
        o.id === id.data &&
        o.verified &&
        ["owner", "admin", "recruiter"].includes(o.role),
    );
    if (!org)
      throw new ApiError(
        403,
        "Discovery is private to your verified hiring team.",
      );
    if (!hasDiscovery(org.tier))
      throw new ApiError(
        403,
        "Discovery is included in Growth and higher plans. Compare plans in your Billing tab.",
        "DISCOVERY_PLAN_REQUIRED",
      );
    const region = z
      .enum([
        "ACT",
        "NSW",
        "NT",
        "QLD",
        "SA",
        "TAS",
        "VIC",
        "WA",
        "OTHER",
        "UNKNOWN",
      ])
      .nullable()
      .safeParse(params.get("region"));
    if (!region.success)
      throw new ApiError(400, "Choose a valid visitor region.");
    const { data, error } = await premiumAdmin().rpc(
      "read_discovery_by_region",
      {
        p_region: region.data,
        p_org: id.data,
        p_days: Number(days.data),
      },
    );
    if (error) throw new ApiError(503, "Discovery could not be loaded.");
    return json(data);
  } catch (e) {
    return apiError(e);
  }
}
