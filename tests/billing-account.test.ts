import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  session: vi.fn(),
  admin: vi.fn(),
  stripe: vi.fn(),
  list: vi.fn(),
  portal: vi.fn(),
  checkout: vi.fn(),
  retrievePrice: vi.fn(),
  mapping: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ getSessionContext: m.session }));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: m.admin,
  stripeClient: m.stripe,
}));
vi.mock("@/lib/premium/billing", () => ({
  customerFor: async () => "cus_personal",
  withBillingLease: async (u: string, work: (lease: unknown) => unknown) =>
    work({ userId: u, token: "lease", deadline: performance.now() + 50000 }),
  assertBillingLeaseFresh: () => {},
}));
import { POST } from "../src/app/api/billing/account/route";
import { billingScope } from "../src/lib/premium/business-billing";
import { sandboxPlans } from "../src/lib/billing-plans";
const org = "20000000-0000-4000-8000-000000000001",
  origin = "https://westmere.test";
const request = (b: unknown) =>
  new Request(origin + "/api/billing/account", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
  m.session.mockResolvedValue({
    user: { id: "owner", email: "owner@example.test" },
    supabase: {},
    business: {
      kind: "employer",
      organisations: [
        { id: org, role: "owner", verified: true, name: "Test company" },
      ],
    },
  });
  m.mapping.mockResolvedValue({
    data: {
      stripe_customer_id: "cus_business",
      billing_user_id: "owner",
      audience: "employer",
    },
    error: null,
  });
  m.admin.mockReturnValue({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: m.mapping }) }),
    }),
  });
  const plan = sandboxPlans.find((p) => p.code === "growth")!;
  m.retrievePrice.mockResolvedValue({
    id: plan.priceId,
    active: true,
    livemode: false,
    unit_amount: plan.amount,
    currency: "aud",
    recurring: { interval: "month", interval_count: 1 },
    product: plan.productId,
  });
  m.list.mockResolvedValue({
    data: [
      {
        id: "sub_business",
        status: "active",
        livemode: false,
        items: {
          data: [{ id: "si_business", price: { id: sandboxPlans[1].priceId } }],
        },
      },
    ],
    has_more: false,
  });
  m.portal.mockResolvedValue({
    url: "https://billing.stripe.com/test_session",
  });
  m.stripe.mockReturnValue({
    prices: { retrieve: m.retrievePrice },
    subscriptions: { list: m.list },
    invoices: { list: async () => ({ data: [] }) },
    billingPortal: { sessions: { create: m.portal } },
    checkout: { sessions: { create: m.checkout } },
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("sandbox billing boundaries", () => {
  it("requires the verified owner and does not confer billing rights on hiring recruiters", async () => {
    m.session.mockResolvedValue({
      user: { id: "recruiter" },
      supabase: {},
      business: {
        kind: "employer",
        organisations: [{ id: org, role: "recruiter", verified: true }],
      },
    });
    await expect(billingScope(org)).rejects.toMatchObject({
      code: "BILLING_OWNER_REQUIRED",
    });
    expect(m.stripe).not.toHaveBeenCalled();
  });
  it("preserves cancellation and payment management when business verification is suspended or Terms need renewal", async () => {
    m.session.mockResolvedValue({
      user: { id: "owner" },
      supabase: {},
      business: {
        kind: "employer",
        needsOnboarding: true,
        organisations: [{ id: org, role: "owner", verified: false }],
      },
    });
    expect(
      (
        await POST(
          request({ organisation: org, action: "change", plan: "growth" }),
        )
      ).status,
    ).toBe(409);
    expect(
      (await POST(request({ organisation: org, action: "portal" }))).status,
    ).toBe(200);
    expect(m.portal).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: "bpc_1Uax45RX8vZXnntOsqutY8zk",
      }),
    );
  });
  it("does not let another owner use an existing billing customer", async () => {
    m.mapping.mockResolvedValue({
      data: {
        stripe_customer_id: "cus_other",
        billing_user_id: "different-owner",
        audience: "employer",
      },
      error: null,
    });
    expect(
      (await POST(request({ organisation: org, action: "portal" }))).status,
    ).toBe(403);
    expect(m.portal).not.toHaveBeenCalled();
  });
  it("returns a hosted price-change confirmation without directly updating or charging a subscription", async () => {
    const r = await POST(
      request({ organisation: org, action: "change", plan: "growth" }),
    );
    expect(r.status).toBe(200);
    expect(m.portal).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_business",
        configuration: "bpc_1UcN1rRX8vZXnntOspsuEXcq",
        flow_data: expect.objectContaining({
          type: "subscription_update_confirm",
          subscription_update_confirm: {
            subscription: "sub_business",
            items: [
              {
                id: "si_business",
                price: sandboxPlans.find((p) => p.code === "growth")!.priceId,
                quantity: 1,
              },
            ],
          },
        }),
      }),
    );
    expect(m.checkout).not.toHaveBeenCalled();
  });
  it("rejects live or cross-audience prices before creating a payment flow", async () => {
    expect(
      (
        await POST(
          request({
            organisation: org,
            action: "change",
            plan: "agency_growth",
          }),
        )
      ).status,
    ).toBe(400);
    m.retrievePrice.mockResolvedValue({
      ...(await m.retrievePrice()),
      livemode: true,
    });
    expect(
      (
        await POST(
          request({ organisation: org, action: "change", plan: "growth" }),
        )
      ).status,
    ).toBe(503);
    expect(m.portal).not.toHaveBeenCalled();
    expect(m.checkout).not.toHaveBeenCalled();
  });
});
