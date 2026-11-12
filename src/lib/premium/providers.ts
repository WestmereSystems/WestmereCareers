import "server-only";
import OpenAI from "openai";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { PremiumError } from "./http";

export function premiumAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new PremiumError(
      "NOT_CONFIGURED",
      "Careers+ is being prepared. Please try again later.",
      503,
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function openAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new PremiumError(
      "NOT_CONFIGURED",
      "The CV studio is being prepared. Your CV has not been sent anywhere.",
      503,
    );
  return new OpenAI({ apiKey, timeout: 50000, maxRetries: 0 });
}

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key)
    throw new PremiumError(
      "NOT_CONFIGURED",
      "Careers+ subscriptions are not available yet.",
      503,
    );
  // Keep each operation bounded below the 90-second per-user billing lease.
  // Stripe retries webhooks; browser retries reuse Checkout's idempotency key.
  return new Stripe(key, { timeout: 8000, maxNetworkRetries: 0 });
}

export function careersPriceId(): string {
  const id = process.env.STRIPE_PRICE_ID;
  if (!id)
    throw new PremiumError(
      "NOT_CONFIGURED",
      "Careers+ subscriptions are not available yet.",
      503,
    );
  return id;
}
