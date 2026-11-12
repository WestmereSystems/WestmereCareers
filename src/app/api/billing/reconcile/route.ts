import { NextResponse } from "next/server";
import {
  reconcileCustomer,
  validatedCareersPrice,
} from "@/lib/premium/billing";
import { cronAuthorized } from "@/lib/premium/cron";
import { premiumError, PremiumError } from "@/lib/premium/http";
import {
  careersPriceId,
  premiumAdmin,
  stripeClient,
} from "@/lib/premium/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Vercel Cron uses GET and attaches CRON_SECRET as its Bearer authorization. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32)
    return NextResponse.json(
      {
        error: "Scheduled reconciliation is not configured.",
        code: "NOT_CONFIGURED",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  if (!cronAuthorized(request.headers.get("authorization"), secret))
    return NextResponse.json(
      {
        error: "A valid scheduled-service credential is required.",
        code: "UNAUTHORIZED",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  try {
    // Resolve every required setting before any database mutation. Missing secrets
    // cannot trigger partial customer creation, entitlement writes or Stripe calls.
    careersPriceId();
    const stripe = stripeClient();
    const admin = premiumAdmin();
    const deadline = performance.now() + 80000;
    await validatedCareersPrice(stripe);
    const { data: customers, error } = await admin
      .from("billing_customers")
      .select("stripe_customer_id")
      .order("last_reconciliation_attempt_at", {
        ascending: true,
        nullsFirst: true,
      })
      .limit(100);
    if (error)
      throw new PremiumError(
        "RECONCILIATION_UNAVAILABLE",
        "Scheduled reconciliation is temporarily unavailable.",
        503,
      );
    const selected = customers ?? [];
    const counts = {
      selected: selected.length,
      updated: 0,
      failed: 0,
      busy: 0,
      ignored: 0,
      deferred: 0,
    };
    let index = 0;
    async function worker() {
      while (index < selected.length && performance.now() < deadline) {
        const customer = selected[index++];
        try {
          const changed = await reconcileCustomer(
            customer.stripe_customer_id,
            Math.floor(Date.now() / 1000),
          );
          if (changed) counts.updated++;
          else counts.ignored++;
        } catch (error) {
          if (error instanceof PremiumError && error.code === "BILLING_BUSY")
            counts.busy++;
          else counts.failed++;
        }
      }
    }
    // Independent customers can run concurrently; all operations for one user
    // still share the database lease with Checkout and webhook processing.
    await Promise.all(
      Array.from({ length: Math.min(5, selected.length) }, () => worker()),
    );
    counts.deferred = selected.length - index;
    return NextResponse.json(counts, {
      status: counts.failed ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return premiumError(error);
  }
}
