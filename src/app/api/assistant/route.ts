import { assertIndividual } from "@/lib/server/business";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/server/auth";
import {
  assistantIdentity,
  guestCookie,
  readGuestToken,
} from "@/lib/server/assistant-identity";
import {
  boundedJson,
  premiumError,
  PremiumError,
  requireOrigin,
} from "@/lib/premium/http";
import { openAIClient, premiumAdmin } from "@/lib/premium/providers";
import { studioRequestSchema } from "@/lib/premium/contracts";
import { generateStudioReview } from "@/lib/premium/studio-review";
import { POST as paidStudio } from "@/app/api/studio/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const response = (body: unknown) =>
  NextResponse.json(body, {
    headers: { "Cache-Control": "private, no-store" },
  });

export async function GET(request: Request) {
  try {
    const { supabase, user, isPremium, business, testingAccess } =
      await getSessionContext();
    if (supabase && user) assertIndividual(business);
    if (!supabase)
      throw new PremiumError(
        "NOT_CONFIGURED",
        "AI assistance is being prepared. Your CV has not been sent anywhere.",
        503,
      );
    if (isPremium && user) {
      const { data: paidSubscription, error } = await supabase
        .from("subscriptions")
        .select("current_period_start,current_period_end")
        .eq("user_id", user.id)
        .single();
      const subscription =
        testingAccess?.tier === "careers_plus"
          ? {
              current_period_start: testingAccess.startsAt,
              current_period_end: testingAccess.expiresAt,
            }
          : paidSubscription;
      if ((!testingAccess && error) || !subscription)
        throw new PremiumError(
          "USAGE_UNAVAILABLE",
          "Your studio allowance is temporarily unavailable.",
          503,
        );
      const { count, error: usageError } = await supabase
        .from("ai_usage")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", user.id)
        .eq("period_start", subscription.current_period_start)
        .or(
          `status.eq.completed,and(status.eq.reserved,created_at.gte.${new Date(Date.now() - 15 * 60_000).toISOString()})`,
        );
      if (usageError)
        throw new PremiumError(
          "USAGE_UNAVAILABLE",
          "Your studio allowance is temporarily unavailable.",
          503,
        );
      return response({
        tier: "Careers+",
        cap: 30,
        remaining: Math.max(0, 30 - (count || 0)),
        renewsAt: subscription.current_period_end,
      });
    }
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const cookie = (await cookies()).get(guestCookie)?.value;
    if (!user && !readGuestToken(cookie, secret))
      return response({ tier: "Guest", cap: 1, remaining: 1 });
    const identity = assistantIdentity(
      cookie,
      user?.id || null,
      request,
      secret,
    );
    const { data, error } = await premiumAdmin().rpc("trial_ai_remaining", {
      p_principal: identity.principal,
      p_tier: identity.tier,
    });
    if (error || typeof data !== "number")
      throw new PremiumError(
        "USAGE_UNAVAILABLE",
        "Your free AI allowance is temporarily unavailable.",
        503,
      );
    return response({
      tier: user ? "Free account" : "Guest",
      cap: identity.cap,
      remaining: data,
    });
  } catch (error) {
    return premiumError(error);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const context = await getSessionContext();
    if (!context.supabase)
      throw new PremiumError(
        "NOT_CONFIGURED",
        "AI assistance is being prepared. Your CV has not been sent anywhere.",
        503,
      );
    if (context.user) assertIndividual(context.business);
    if (context.isPremium) return paidStudio(request);
    const parsed = studioRequestSchema.safeParse(await boundedJson(request));
    if (!parsed.success)
      throw new PremiumError(
        "INVALID_REQUEST",
        parsed.error.issues[0]?.message || "Check the supplied text.",
      );
    if (context.user && !context.user.email_confirmed_at)
      throw new PremiumError(
        "VERIFY_EMAIL",
        "Verify your email to use your three account reviews.",
        403,
      );
    const client = openAIClient();
    const admin = premiumAdmin();
    const cookieStore = await cookies();
    const identity = assistantIdentity(
      cookieStore.get(guestCookie)?.value,
      context.user?.id || null,
      request,
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    );
    const { data: reservation, error } = await admin.rpc(
      "reserve_trial_ai_usage",
      {
        p_principal: identity.principal,
        p_tier: identity.tier,
        p_abuse: identity.abuse,
        p_user: context.user?.id || null,
      },
    );
    if (error || typeof reservation !== "string")
      throw new PremiumError(
        "TRIAL_LIMIT",
        "Your free reviews are used, or today’s preview limit has been reached. Sign in for your account allowance or explore Careers+.",
        429,
      );
    if (!context.user)
      cookieStore.set(guestCookie, identity.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
      });
    let settled = false;
    try {
      const result = await generateStudioReview(client, parsed.data);
      const { data: success, error: settleError } = await admin.rpc(
        "settle_trial_ai_usage",
        { p_reservation: reservation, p_success: true },
      );
      if (settleError || success !== true)
        throw new PremiumError(
          "USAGE_SETTLEMENT_PENDING",
          "Your review could not be completed safely. Please try again later.",
          503,
        );
      settled = true;
      return response({ result });
    } finally {
      if (!settled)
        await admin.rpc("settle_trial_ai_usage", {
          p_reservation: reservation,
          p_success: false,
        });
    }
  } catch (error) {
    return premiumError(error);
  }
}
