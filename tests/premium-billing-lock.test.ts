import { beforeEach, describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  admin: vi.fn(),
  stripe: vi.fn(),
  priceId: vi.fn(),
  list: vi.fn(),
  maybe: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: mocks.admin,
  stripeClient: mocks.stripe,
  careersPriceId: mocks.priceId,
}));
import {
  assertBillingLeaseFresh,
  reconcileCustomer,
  withBillingLease,
} from "../src/lib/premium/billing";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.priceId.mockReturnValue("price_careers");
  mocks.admin.mockReturnValue({
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybe }) }),
      update: (value: unknown) => ({ eq: () => mocks.update(value) }),
    }),
  });
  mocks.stripe.mockReturnValue({ subscriptions: { list: mocks.list } });
  mocks.update.mockResolvedValue({ error: null });
  mocks.maybe.mockResolvedValue({ data: { user_id: "user-1" }, error: null });
});

describe("shared billing lease", () => {
  it("serializes operations for one user and releases the exact token", async () => {
    let locked = false;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "acquire_billing_lease") {
        if (locked) return { data: null, error: null };
        locked = true;
        return { data: "lease-1", error: null };
      }
      if (name === "release_billing_lease") locked = false;
      return { data: null, error: null };
    });
    let unblock!: () => void;
    const waiting = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const first = withBillingLease("user-1", async () => {
      await waiting;
      return "first";
    });
    // Wait only for the local acquisition promise to resolve into the callback.
    await Promise.resolve();
    await Promise.resolve();
    const rejected = vi.fn();
    await expect(
      withBillingLease("user-1", async () => {
        rejected();
      }),
    ).rejects.toMatchObject({ code: "BILLING_BUSY" });
    expect(rejected).not.toHaveBeenCalled();
    unblock();
    expect(await first).toBe("first");
    expect(mocks.rpc).toHaveBeenCalledWith("release_billing_lease", {
      p_user_id: "user-1",
      p_token: "lease-1",
    });
    expect(await withBillingLease("user-1", async () => true)).toBe(true);
  });
  it("releases the lease even if Stripe processing fails", async () => {
    mocks.rpc.mockResolvedValue({ data: "lease-1", error: null });
    await expect(
      withBillingLease("user-1", async () => {
        throw new Error("provider failed");
      }),
    ).rejects.toThrow("provider failed");
    expect(mocks.rpc).toHaveBeenCalledWith("release_billing_lease", {
      p_user_id: "user-1",
      p_token: "lease-1",
    });
  });
  it("denies external mutations beyond the conservative deadline", () => {
    expect(() =>
      assertBillingLeaseFresh({
        userId: "user-1",
        token: "lease-1",
        deadline: -1,
      }),
    ).toThrow();
  });
  it("retrieves current Stripe state after acquiring the lease and applies its token", async () => {
    const order: string[] = [];
    mocks.rpc.mockImplementation(async (name: string) => {
      order.push(name);
      return {
        data: name === "acquire_billing_lease" ? "lease-1" : null,
        error: null,
      };
    });
    mocks.list.mockImplementation(async () => {
      order.push("stripe-current-state");
      return {
        has_more: false,
        data: [
          {
            id: "sub_current",
            status: "active",
            created: 2000,
            cancel_at_period_end: false,
            items: {
              data: [
                {
                  current_period_start: 2000,
                  current_period_end: 3000,
                  price: {
                    id: "price_careers",
                    currency: "aud",
                    unit_amount: 2500,
                    recurring: { interval: "month", interval_count: 1 },
                  },
                },
              ],
            },
          },
        ],
      };
    });
    expect(await reconcileCustomer("cus_one", 1000)).toBe(true);
    expect(order.indexOf("acquire_billing_lease")).toBeLessThan(
      order.indexOf("stripe-current-state"),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_subscription_state",
      expect.objectContaining({
        p_lease_token: "lease-1",
        p_stripe_subscription_id: "sub_current",
        p_status: "active",
        p_event_created: 1000,
      }),
    );
  });
});
