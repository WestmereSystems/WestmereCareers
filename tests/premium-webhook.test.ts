import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import Stripe from "stripe";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  stripe: vi.fn(),
  reconcile: vi.fn(),
  insert: vi.fn(),
  read: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: mocks.admin,
  stripeClient: mocks.stripe,
}));
vi.mock("@/lib/premium/billing", () => ({
  reconcileCustomer: mocks.reconcile,
  stripeCustomerId: (value: unknown) =>
    typeof value === "string" && value.startsWith("cus_") ? value : null,
}));
import { POST } from "../src/app/api/billing/webhook/route";

const secret = "whsec_local_signature_test_only";
const stripe = new Stripe("sk_test_local_signature_test_only");
const event = {
  id: "evt_local",
  object: "event",
  created: 1000,
  type: "customer.subscription.updated",
  data: { object: { id: "sub_local", customer: "cus_local" } },
};
function request(body = JSON.stringify(event), valid = true) {
  const signature = valid
    ? stripe.webhooks.generateTestHeaderString({ payload: body, secret })
    : "t=1,v1=invalid";
  return new Request("http://localhost:3000/api/billing/webhook", {
    method: "POST",
    headers: {
      "stripe-signature": signature,
      "content-type": "application/json",
    },
    body,
  });
}
beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  vi.clearAllMocks();
  mocks.stripe.mockReturnValue(stripe);
  mocks.insert.mockResolvedValue({ error: null });
  mocks.read.mockResolvedValue({ data: { processed_at: null }, error: null });
  mocks.update.mockResolvedValue({ error: null });
  mocks.reconcile.mockResolvedValue(undefined);
  mocks.admin.mockReturnValue({
    from: () => ({
      insert: mocks.insert,
      select: () => ({ eq: () => ({ single: mocks.read }) }),
      update: (values: unknown) => ({ eq: () => mocks.update(values) }),
    }),
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("Stripe webhook boundary", () => {
  it("verifies the raw signed body before recording or applying state", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith({
      id: "evt_local",
      type: "customer.subscription.updated",
      payload: { objectId: "sub_local", eventCreated: 1000 },
    });
    expect(mocks.reconcile).toHaveBeenCalledWith("cus_local", 1000);
  });
  it("rejects invalid signatures before accessing privileged state", async () => {
    expect((await POST(request(JSON.stringify(event), false))).status).toBe(
      400,
    );
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("treats a completed replay as a successful no-op", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "23505" } });
    mocks.read.mockResolvedValue({
      data: { processed_at: "2026-11-12T00:00:00Z" },
      error: null,
    });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("returns a retryable response when reconciliation fails", async () => {
    mocks.reconcile.mockRejectedValue(new Error("private Stripe details"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      "private Stripe",
    );
    expect(mocks.update).toHaveBeenCalledWith({
      error: "RECONCILIATION_FAILED",
    });
    expect(mocks.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ processed_at: expect.any(String) }),
    );
  });
  it("does not record unbounded or raw Stripe personal payloads", async () => {
    const body = JSON.stringify({
      ...event,
      data: {
        object: {
          ...event.data.object,
          customer_email: "private@example.test",
          customer_details: { address: { line1: "Private address" } },
        },
      },
    });
    expect((await POST(request(body))).status).toBe(200);
    expect(JSON.stringify(mocks.insert.mock.calls)).not.toContain(
      "private@example.test",
    );
    expect(JSON.stringify(mocks.insert.mock.calls)).not.toContain(
      "Private address",
    );
  });
});
