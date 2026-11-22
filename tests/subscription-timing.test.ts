import { describe, expect, it } from "vitest";
import { subscriptionTiming } from "../src/lib/premium/subscription-timing";

const item = {
  current_period_start: 1794901407,
  current_period_end: 1797493407,
};
describe("Stripe cancellation synchronization", () => {
  it("recognises the Portal's timestamp-only cancellation", () => {
    expect(
      subscriptionTiming(
        { cancel_at_period_end: false, cancel_at: item.current_period_end },
        item,
      ),
    ).toEqual({
      start: "2026-11-17T07:43:27.000Z",
      end: "2026-12-17T07:43:27.000Z",
      cancelScheduled: true,
    });
  });
  it("ends access at an earlier scheduled cancellation without extending the paid period", () => {
    expect(
      subscriptionTiming({ cancel_at: item.current_period_start + 60 }, item)
        .end,
    ).toBe("2026-11-17T07:44:27.000Z");
    expect(
      subscriptionTiming({ cancel_at: item.current_period_end + 60 }, item).end,
    ).toBe("2026-12-17T07:43:27.000Z");
  });
  it("retains period-end cancellation and recognises resumed renewal", () => {
    expect(
      subscriptionTiming({ cancel_at_period_end: true, cancel_at: null }, item)
        .cancelScheduled,
    ).toBe(true);
    expect(
      subscriptionTiming({ cancel_at_period_end: false, cancel_at: null }, item)
        .cancelScheduled,
    ).toBe(false);
  });
});
