import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  stripe: vi.fn(),
  priceId: vi.fn(),
  validated: vi.fn(),
  reconcile: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: mocks.admin,
  stripeClient: mocks.stripe,
  careersPriceId: mocks.priceId,
}));
vi.mock("@/lib/premium/billing", () => ({
  reconcileCustomer: mocks.reconcile,
  validatedCareersPrice: mocks.validated,
}));
import { GET } from "../src/app/api/billing/reconcile/route";
import { cronAuthorized } from "../src/lib/premium/cron";

const secret = "test-only-cron-secret-at-least-32-characters";
function request(token = secret) {
  return new Request("http://localhost:3000/api/billing/reconcile", {
    headers: { authorization: `Bearer ${token}` },
  });
}
beforeEach(() => {
  vi.stubEnv("CRON_SECRET", secret);
  vi.clearAllMocks();
  mocks.priceId.mockReturnValue("price_careers");
  mocks.stripe.mockReturnValue({});
  mocks.validated.mockResolvedValue(undefined);
  mocks.list.mockResolvedValue({ data: [], error: null });
  mocks.admin.mockReturnValue({
    from: () => ({ select: () => ({ order: () => ({ limit: mocks.list }) }) }),
  });
  mocks.reconcile.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe("scheduled billing reconciliation", () => {
  it("requires the exact Bearer secret and rejects weak configuration", () => {
    expect(cronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(cronAuthorized(`Bearer ${secret}extra`, secret)).toBe(false);
    expect(cronAuthorized(`Basic ${secret}`, secret)).toBe(false);
    expect(cronAuthorized(null, secret)).toBe(false);
    expect(cronAuthorized("Bearer short", "short")).toBe(false);
  });
  it("rejects an unauthenticated scheduler before any provider or database access", async () => {
    const response = await GET(request("incorrect"));
    expect(response.status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.stripe).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("has no side effects when the scheduler itself is unconfigured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request())).status).toBe(503);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("stops before customer processing when billing credentials are missing", async () => {
    mocks.priceId.mockImplementation(() => {
      throw new Error("missing key");
    });
    expect((await GET(request())).status).toBe(503);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("reconciles current state and returns only aggregate counts", async () => {
    mocks.list.mockResolvedValue({
      data: [
        { stripe_customer_id: "cus_one" },
        { stripe_customer_id: "cus_two" },
      ],
      error: null,
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      selected: 2,
      updated: 2,
      failed: 0,
      busy: 0,
      ignored: 0,
      deferred: 0,
    });
    expect(mocks.reconcile).toHaveBeenCalledWith("cus_one", expect.any(Number));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("signals operational failure without exposing customer identifiers", async () => {
    mocks.list.mockResolvedValue({
      data: [{ stripe_customer_id: "cus_private" }],
      error: null,
    });
    mocks.reconcile.mockRejectedValue(new Error("private customer details"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      selected: 1,
      updated: 0,
      failed: 1,
      busy: 0,
      ignored: 0,
      deferred: 0,
    });
  });
});
