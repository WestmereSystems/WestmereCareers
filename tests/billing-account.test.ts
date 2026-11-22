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
import { GET, POST } from "../src/app/api/billing/account/route";
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
    supabase: { rpc: async () => ({ data: { used: 1 }, error: null }) },
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
  const mappingQuery = { eq: vi.fn(), maybeSingle: m.mapping };
  mappingQuery.eq.mockReturnValue(mappingQuery);
  m.admin.mockReturnValue({ from: () => ({ select: () => mappingQuery }) });
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
  it("shows only the three agency plans for the approved WM Recruitment test agency", async () => {
    m.session.mockResolvedValue({
      user: { id: "f5a9d75a-d982-4089-ba39-ec1d0b5d8e0c" },
      supabase: {},
      business: {
        kind: "agency",
        needsOnboarding: true,
        organisations: [
          {
            id: "77549531-6dc1-4a4c-99f5-f9366fa922e9",
            role: "owner",
            kind: "agency",
            verified: true,
            name: "WM Recruitment",
          },
        ],
      },
    });
    m.mapping.mockResolvedValue({ data: null, error: null });
    const response = await GET(
      new Request(
        origin +
          "/api/billing/account?organisation=77549531-6dc1-4a4c-99f5-f9366fa922e9",
      ),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.audience).toBe("agency");
    expect(
      data.plans.map((p: { code: string; amount: number }) => [
        p.code,
        p.amount,
      ]),
    ).toEqual([
      ["agency_starter", 19900],
      ["agency_growth", 39900],
      ["agency_enterprise", 79900],
    ]);
    expect(m.retrievePrice).not.toHaveBeenCalled();
    expect(m.checkout).not.toHaveBeenCalled();
  });
  it("uses the same account billing stream when another owned business is selected", async () => {
    const account = await m.session();
    const anotherOrg = "20000000-0000-4000-8000-000000000002";
    account.business.organisations.push({
      id: anotherOrg,
      role: "owner",
      verified: true,
      name: "Another business",
    });
    m.session.mockResolvedValue(account);
    expect(
      (await POST(request({ organisation: org, action: "portal" }))).status,
    ).toBe(200);
    expect(
      (await POST(request({ organisation: anotherOrg, action: "portal" })))
        .status,
    ).toBe(200);
    expect(m.portal.mock.calls.map(([params]) => params.customer)).toEqual([
      "cus_business",
      "cus_business",
    ]);
  });
  it("blocks a plan change below the linked business count before opening Stripe", async () => {
    const account = await m.session();
    account.supabase.rpc = async () => ({ data: { used: 4 }, error: null });
    m.session.mockResolvedValue(account);
    const response = await POST(
      request({ organisation: org, action: "change", plan: "growth" }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "BUSINESS_LIMIT" });
    expect(m.portal).not.toHaveBeenCalled();
    expect(m.checkout).not.toHaveBeenCalled();
  });
  it("shows a timestamp-only Stripe cancellation as ending access, not renewal", async () => {
    m.list.mockResolvedValue({
      has_more: false,
      data: [
        {
          id: "sub_business",
          status: "active",
          livemode: false,
          cancel_at_period_end: false,
          cancel_at: 1797493407,
          items: {
            data: [
              {
                current_period_start: 1794901407,
                current_period_end: 1797493407,
                price: { id: sandboxPlans[1].priceId },
              },
            ],
          },
        },
      ],
    });
    m.stripe.mockReturnValue({
      customers: {
        retrieve: async () => ({ livemode: false, invoice_settings: {} }),
      },
      subscriptions: { list: m.list },
      invoices: { list: async () => ({ data: [] }) },
    });
    const response = await GET(
      new Request(origin + "/api/billing/account?organisation=" + org),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).subscription).toMatchObject({
      cancelAtPeriodEnd: true,
      renewsAt: "2026-12-17T07:43:27.000Z",
    });
  });
  it("requires the verified owner and does not confer billing rights on hiring recruiters", async () => {
    m.session.mockResolvedValue({
      user: { id: "recruiter" },
      supabase: { rpc: async () => ({ data: { used: 1 }, error: null }) },
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
      supabase: { rpc: async () => ({ data: { used: 1 }, error: null }) },
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
