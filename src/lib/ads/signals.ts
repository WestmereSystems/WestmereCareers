import "server-only";
import { premiumAdmin } from "@/lib/premium/providers";
import { adsConfig } from "./config";

/** An optional priority hint from the already-verified billing webhook. The
 * independent scheduled history scan provides recovery if this hint is missed. */
export async function prioritiseAdsCustomer(customer: string) {
  if (!adsConfig().capture) return;
  try {
    const result = await premiumAdmin()
      .rpc("ads_prioritise_customer", { p_customer: customer })
      .abortSignal(AbortSignal.timeout(1500));
    if (result.error) console.warn("ADS_RECONCILIATION_SIGNAL_FAILED");
  } catch {
    console.warn("ADS_RECONCILIATION_SIGNAL_FAILED");
  }
}
