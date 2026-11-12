import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  subscriptions: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ getSessionContext: mocks.session }));
vi.mock("@/lib/premium/billing", () => ({
  customerFor: vi.fn(async () => "cus_test"),
  validatedCareersPrice: vi.fn(async () => ({ id: "price_test" })),
  assertBillingLeaseFresh: vi.fn(),
  withBillingLease: vi.fn(async (_id, operation) =>
    operation({ token: "lease_test" }),
  ),
}));
vi.mock("@/lib/premium/providers", () => ({
  stripeClient: () => ({
    subscriptions: { list: mocks.subscriptions },
    checkout: { sessions: { list: mocks.list, create: mocks.create } },
  }),
}));
import { POST } from "../src/app/api/billing/checkout/route";

const origin = "http://localhost:3000";
const start = new Date("2026-11-12T12:00:10Z");
const request = () =>
  new Request(`${origin}/api/billing/checkout`, {
    method: "POST",
    headers: { Origin: origin },
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
  vi.useFakeTimers();
  vi.setSystemTime(start);
  mocks.session.mockResolvedValue({
    supabase: {},
    user: { id: "candidate" },
    isPremium: false,
  });
  mocks.subscriptions.mockResolvedValue({ data: [], has_more: false });
  mocks.list.mockResolvedValue({ data: [] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Checkout retries", () => {
  it("resends identical parameters after a lost provider response", async () => {
    mocks.create
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ url: "https://checkout.stripe.com/test" });
    expect((await POST(request())).status).toBe(503);
    vi.setSystemTime(new Date(start.getTime() + 10_000));
    expect((await POST(request())).status).toBe(200);
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
  });
  it("keeps expiry at least thirty minutes away at the end of a retry window", async () => {
    const now = new Date("2026-11-12T12:04:59Z");
    vi.setSystemTime(now);
    mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
    expect((await POST(request())).status).toBe(200);
    const [params] = mocks.create.mock.calls[0];
    const remaining = params.expires_at - now.getTime() / 1000 - 8;
    expect(remaining).toBeGreaterThanOrEqual(1800);
    expect(remaining).toBeLessThanOrEqual(2160);
  });
});
