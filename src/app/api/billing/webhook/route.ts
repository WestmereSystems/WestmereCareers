import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { reconcileCustomer, stripeCustomerId } from "@/lib/premium/billing";
import { premiumError, PremiumError } from "@/lib/premium/http";
import { premiumAdmin, stripeClient } from "@/lib/premium/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

async function rawBody(request: Request) {
  const max = 1024 * 1024;
  if (Number(request.headers.get("content-length") ?? 0) > max)
    throw new PremiumError("TOO_LARGE", "Webhook payload too large.", 413);
  if (!request.body)
    throw new PremiumError("INVALID_WEBHOOK", "Webhook payload is missing.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) {
        await reader.cancel();
        throw new PremiumError("TOO_LARGE", "Webhook payload too large.", 413);
      }
      chunks.push(value);
    }
    const buffer = Buffer.alloc(length);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return buffer;
  } finally {
    reader.releaseLock();
  }
}

const handled = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
]);

export async function POST(request: Request) {
  let capturedId: string | undefined;
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret)
      throw new PremiumError(
        "NOT_CONFIGURED",
        "Billing webhook is not configured.",
        503,
      );
    const signature = request.headers.get("stripe-signature");
    if (!signature)
      throw new PremiumError(
        "INVALID_SIGNATURE",
        "Webhook signature is missing.",
      );
    const stripe = stripeClient();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        await rawBody(request),
        signature,
        secret,
      );
    } catch (error) {
      if (error instanceof PremiumError) throw error;
      throw new PremiumError(
        "INVALID_SIGNATURE",
        "Webhook signature is invalid.",
      );
    }
    const admin = premiumAdmin();
    const object = event.data.object;
    const objectId =
      "id" in object && typeof object.id === "string" ? object.id : null;
    const { error: captureError } = await admin.from("stripe_events").insert({
      id: event.id,
      type: event.type,
      payload: { objectId, eventCreated: event.created },
    });
    if (captureError && captureError.code !== "23505")
      throw new PremiumError(
        "CAPTURE_FAILED",
        "Webhook could not be recorded.",
        503,
      );
    const { data: captured, error: readError } = await admin
      .from("stripe_events")
      .select("processed_at")
      .eq("id", event.id)
      .single();
    if (readError)
      throw new PremiumError(
        "CAPTURE_FAILED",
        "Webhook could not be recorded.",
        503,
      );
    if (captured.processed_at) return NextResponse.json({ received: true });
    capturedId = event.id;
    if (handled.has(event.type)) {
      const customer =
        "customer" in object ? stripeCustomerId(object.customer) : null;
      if (customer) await reconcileCustomer(customer, event.created);
    }
    const { error: completeError } = await admin
      .from("stripe_events")
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq("id", event.id);
    if (completeError)
      throw new PremiumError(
        "COMPLETION_FAILED",
        "Webhook could not be completed.",
        503,
      );
    return NextResponse.json({ received: true });
  } catch (error) {
    if (capturedId) {
      // Keep only a bounded internal code; raw provider errors are not persisted.
      try {
        await premiumAdmin()
          .from("stripe_events")
          .update({
            error:
              error instanceof PremiumError
                ? error.code
                : "RECONCILIATION_FAILED",
          })
          .eq("id", capturedId);
      } catch {
        /* Stripe retries the non-2xx response. */
      }
    }
    return premiumError(error);
  }
}
