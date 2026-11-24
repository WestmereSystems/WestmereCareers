import { afterEach, expect, it, vi } from "vitest";
import {
  billingModeFor,
  billingPlans,
  sandboxOwnerId,
  livePortal,
} from "../src/lib/premium/billing-mode";
import { stripeClient } from "../src/lib/premium/providers";
afterEach(() => vi.unstubAllEnvs());
it.each(["employer", "agency", "individual"])(
  "routes production %s billing to live while retaining the owner sandbox exception",
  (audience) => {
    vi.stubEnv("NODE_ENV", "production");
    expect(billingModeFor({ id: "verified-business" }, audience)).toBe("live");
    expect(billingModeFor({ id: sandboxOwnerId }, audience)).toBe("test");
  },
);
it("does not silently substitute sandbox credentials when live billing is missing", () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("STRIPE_LIVE_SECRET_KEY", "");
  expect(() => stripeClient("live")).toThrow("Billing is not configured");
  vi.stubEnv("STRIPE_LIVE_SECRET_KEY", "sk_test_wrongmode");
  expect(() => stripeClient("live")).toThrow();
  vi.stubEnv("STRIPE_LIVE_SECRET_KEY", "rk_live_fixture");
  expect(stripeClient("live")).toBeDefined();
});
it("uses privileged Auth app metadata for an explicitly designated tester", () => {
  vi.stubEnv("NODE_ENV", "production");
  expect(
    billingModeFor(
      {
        id: "designated-tester",
        app_metadata: { westmere_billing_test: true },
      },
      "employer",
    ),
  ).toBe("test");
  for (const value of [false, "true", 1, null])
    expect(
      billingModeFor(
        {
          id: "ordinary-business",
          app_metadata: { westmere_billing_test: value },
        },
        "employer",
      ),
    ).toBe("live");
  const forged = {
    id: "ordinary-business",
    user_metadata: { westmere_billing_test: true },
  };
  expect(billingModeFor(forged, "employer")).toBe("live");
});
it("keeps the live price catalogue separate and requires live portal configuration", () => {
  vi.stubEnv(
    "STRIPE_LIVE_PLANS",
    JSON.stringify({
      starter: { priceId: "price_live", productId: "prod_live" },
    }),
  );
  const plan = billingPlans("live").find((p) => p.code === "starter")!;
  expect(plan).toMatchObject({
    priceId: "price_live",
    productId: "prod_live",
    amount: 12900,
  });
  expect(billingPlans("live").some((p) => p.audience === "individual")).toBe(
    true,
  );
  expect(
    billingPlans("test").find((p) => p.code === "starter")!.priceId,
  ).not.toBe(plan.priceId);
  expect(() => livePortal("agency")).toThrow();
  vi.stubEnv("STRIPE_LIVE_PORTAL_AGENCY", "bpc_live");
  expect(livePortal("agency")).toBe("bpc_live");
});
