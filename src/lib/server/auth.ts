import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/server/http";

export function hasCurrentPremiumSubscription(
  subscription: {
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
    price_id: string | null;
  } | null,
  now = Date.now(),
) {
  if (!subscription || !["active", "trialing"].includes(subscription.status))
    return false;
  if (
    !process.env.STRIPE_PRICE_ID ||
    subscription.price_id !== process.env.STRIPE_PRICE_ID
  )
    return false;
  const start = Date.parse(subscription.current_period_start || "");
  const end = Date.parse(subscription.current_period_end || "");
  return (
    Number.isFinite(start) && Number.isFinite(end) && start <= now && end > now
  );
}

export async function getSessionContext() {
  const supabase = await createClient();
  if (!supabase)
    return { supabase: null, user: null as User | null, isPremium: false };
  // getUser validates with Supabase Auth; no user-editable metadata or local demo flag grants access.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (
    authError &&
    authError.name !== "AuthSessionMissingError" &&
    authError.status !== 400 &&
    authError.status !== 401 &&
    authError.status !== 403
  ) {
    throw new ApiError(
      503,
      "Sign-in is temporarily unavailable. Please try again.",
      "AUTH_UNAVAILABLE",
    );
  }
  if (!user) return { supabase, user: null as User | null, isPremium: false };
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status,current_period_start,current_period_end,price_id")
    .eq("user_id", user.id)
    .maybeSingle();
  // Fail closed when billing state is missing, stale or unreadable.
  return {
    supabase,
    user,
    isPremium: hasCurrentPremiumSubscription(subscription),
  };
}

export async function requireSession() {
  const context = await getSessionContext();
  if (!context.supabase)
    throw new ApiError(
      503,
      "Account services are being configured. Please check back soon.",
      "SERVICE_NOT_CONFIGURED",
    );
  if (!context.user)
    throw new ApiError(401, "Sign in to continue.", "SIGN_IN_REQUIRED");
  return { ...context, supabase: context.supabase, user: context.user };
}
