import {
  billingModeFor,
  liveBusinessBillingReady,
  liveIndividualBillingReady,
} from "@/lib/premium/billing-mode";
import { marketplaceOpen } from "@/lib/server/launch";
import { getSessionContext } from "@/lib/server/auth";
import { apiError, json } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { supabase, user, isPremium, business, testingAccess, ...context } =
      await getSessionContext();
    const [staff, profile, sample] =
      user && supabase
        ? await Promise.all([
            supabase.rpc("my_staff_role"),
            supabase
              .from("profiles")
              .select("full_name")
              .eq("id", user.id)
              .maybeSingle(),
            supabase.rpc("my_sample_workspace"),
          ])
        : [null, null, null];
    return json({
      marketplaceOpen: await marketplaceOpen(),
      launchAccess: "launchAccess" in context ? context.launchAccess : null,
      configured: Boolean(supabase),
      businessPaymentsReady: liveBusinessBillingReady(),
      individualPaymentsReady: liveIndividualBillingReady(),
      user: user
        ? {
            id: user.id,
            email: user.email,
            fullName: profile?.data?.full_name || "",
          }
        : null,
      business,
      isPremium,
      testingAccess,
      billingSandbox: user
        ? billingModeFor(user, business?.kind || "individual") === "test"
        : false,
      sampleWorkspace: sample?.data === true,
      staffRole: staff?.error ? null : (staff?.data ?? null),
    });
  } catch (e) {
    return apiError(e);
  }
}
