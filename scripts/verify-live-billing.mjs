// One-off release check, run inside Vercel so the live key stays in secret storage.
// No payment method, charge or subscription is created.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";

const key = process.env.STRIPE_LIVE_SECRET_KEY;
if (!/^(rk|sk)_live_/.test(key || ""))
  throw new Error("A live billing key is required.");
const stripe = new Stripe(key, { timeout: 8000, maxNetworkRetries: 0 });
const plans = JSON.parse(process.env.STRIPE_LIVE_PLANS || "{}");
const amounts = {
  careers_plus: 2500,
  starter: 12900,
  growth: 24900,
  enterprise: 49900,
  agency_starter: 19900,
  agency_growth: 39900,
  agency_enterprise: 79900,
};
const origin = "https://westmere.com.au";
const sessions = [];
let customer;
let failed = false;
try {
  for (const [code, amount] of Object.entries(amounts)) {
    const plan = plans[code];
    assert.ok(plan?.priceId && plan?.productId);
    const price = await stripe.prices.retrieve(plan.priceId);
    const product = await stripe.products.retrieve(plan.productId);
    assert.equal(price.livemode, true);
    assert.equal(product.livemode, true);
    assert.equal(price.active, true);
    assert.equal(product.active, true);
    assert.equal(price.product, product.id);
    assert.equal(price.unit_amount, amount);
    assert.equal(price.currency, "aud");
    assert.equal(price.recurring?.interval, "month");
    assert.equal(price.recurring?.interval_count, 1);
    assert.equal(price.tax_behavior, "inclusive");
  }
  customer = await stripe.customers.create({
    name: "Westmere release verification — disposable empty billing record",
    metadata: {
      application: "westmere-careers",
      purpose: "release_verification",
      run: randomUUID(),
    },
  });
  assert.equal(customer.livemode, true);
  await stripe.customers.retrieve(customer.id);
  await stripe.paymentMethods.list({ customer: customer.id, limit: 1 });
  await stripe.subscriptions.list({ customer: customer.id, limit: 1 });
  await stripe.invoices.list({ customer: customer.id, limit: 1 });
  await stripe.charges.list({ limit: 1 });
  const preview = await stripe.invoices.createPreview({
    customer: customer.id,
    automatic_tax: { enabled: false },
    subscription_details: {
      items: [{ price: plans.starter.priceId, quantity: 1 }],
    },
  });
  assert.equal(preview.amount_due, amounts.starter);
  assert.equal(preview.automatic_tax.enabled, false);
  assert.equal(
    preview.total_taxes?.reduce((sum, tax) => sum + tax.amount, 0) || 0,
    0,
  );
  for (const audience of ["EMPLOYER", "AGENCY", "RESTRICTED", "INDIVIDUAL"]) {
    const configuration = process.env[`STRIPE_LIVE_PORTAL_${audience}`];
    const portal =
      await stripe.billingPortal.configurations.retrieve(configuration);
    assert.equal(portal.livemode, true);
    assert.equal(portal.active, true);
    assert.equal(portal.default_return_url, `${origin}/account?tab=billing`);
    assert.equal(portal.features.subscription_cancel.mode, "at_period_end");
    assert.equal(
      portal.features.subscription_update.enabled,
      audience !== "RESTRICTED" && audience !== "INDIVIDUAL",
    );
    await stripe.billingPortal.sessions.create({
      customer: customer.id,
      configuration,
      return_url: `${origin}/account?tab=billing`,
    });
  }
  for (const code of ["careers_plus", "starter", "agency_starter"]) {
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "subscription",
      integration_identifier: "westmere_careers_klvobqoq",
      line_items: [{ price: plans[code].priceId, quantity: 1 }],
      automatic_tax: { enabled: false },
      success_url: `${origin}/account?tab=billing&checkout=complete`,
      cancel_url: `${origin}/account?tab=billing&checkout=canceled`,
      metadata: {
        application: "westmere-careers",
        purpose: "release_verification",
      },
    });
    sessions.push(session.id);
    assert.equal(session.livemode, true);
    assert.equal(session.status, "open");
    assert.equal(session.amount_total, amounts[code]);
    assert.equal(session.total_details.amount_tax, 0);
    assert.equal(session.automatic_tax.enabled, false);
    assert.equal(session.subscription, null);
  }
} catch (error) {
  failed = true;
  // Stripe error messages may contain request data. Never log them or the key.
  console.error("Live billing release verification failed", {
    type: error?.type || error?.name,
    code: error?.code || "ASSERTION_FAILED",
  });
} finally {
  for (const id of sessions) {
    try {
      await stripe.checkout.sessions.expire(id);
    } catch {
      failed = true;
      console.error("Verification checkout cleanup failed");
    }
  }
  if (customer) {
    try {
      await stripe.customers.del(customer.id);
    } catch {
      failed = true;
      console.error("Verification customer cleanup failed");
    }
  }
}
if (failed) process.exitCode = 1;
else
  console.log(
    "Live billing verified: seven AUD monthly prices; restricted runtime key; customer, invoice preview and four portals; personal, employer and agency checkout with zero tax; temporary sessions expired and empty customer deleted. No payment or subscription created.",
  );
