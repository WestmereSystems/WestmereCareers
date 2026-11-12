import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  assertSameOrigin,
  parseBody,
  safeReturnPath,
} from "../src/lib/server/http";
import { moneyAmount } from "../src/lib/server/validation";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { hasCurrentPremiumSubscription } from "../src/lib/server/auth";

describe("browser request boundaries", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://westmere.example");
  });
  it("rejects cross-origin writes and missing origins", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://westmere.example/api/profile", { method: "POST" }),
      ),
    ).toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("https://westmere.example/api/profile", {
          method: "POST",
          headers: { origin: "https://attacker.example" },
        }),
      ),
    ).toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("https://westmere.example/api/profile", {
          method: "POST",
          headers: {
            origin: "https://westmere.example",
            "sec-fetch-site": "cross-site",
          },
        }),
      ),
    ).toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("https://westmere.example/api/profile", {
          method: "POST",
          headers: { origin: "https://westmere.example" },
        }),
      ),
    ).not.toThrow();
  });
  it.each([
    "//attacker.example",
    "https://attacker.example",
    "/\\attacker.example",
    "/\n/attacker.example",
  ])("blocks an unsafe authentication return path: %s", (path) => {
    expect(safeReturnPath(path)).toBe("/");
  });
  it("keeps local paths and query state", () => {
    expect(safeReturnPath("/careers-plus?from=application#studio")).toBe(
      "/careers-plus?from=application#studio",
    );
  });
  it("rejects oversized bodies even without content-length", async () => {
    const request = new Request("https://westmere.example/api/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cv: "a".repeat(100) }),
    });
    await expect(
      parseBody(request, z.object({ cv: z.string() }), 50),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects malformed JSON and unknown input properties", async () => {
    const make = (body: string) =>
      new Request("https://westmere.example/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    await expect(
      parseBody(make("{broken"), z.object({ name: z.string() })),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      parseBody(
        make('{"name":"Alex","isPremium":true}'),
        z.object({ name: z.string() }).strict(),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("trusted Careers+ entitlement window", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_ID", "price_careers_plus");
  });
  const now = Date.parse("2026-11-12T12:00:00Z");
  const current = {
    status: "active",
    price_id: "price_careers_plus",
    current_period_start: "2026-11-01T00:00:00Z",
    current_period_end: "2026-12-01T00:00:00Z",
  };
  it("requires active or trialing status, correct price and a current paid period", () => {
    expect(hasCurrentPremiumSubscription(current, now)).toBe(true);
    expect(
      hasCurrentPremiumSubscription({ ...current, status: "trialing" }, now),
    ).toBe(true);
    for (const status of ["canceled", "past_due", "unpaid", "incomplete"])
      expect(hasCurrentPremiumSubscription({ ...current, status }, now)).toBe(
        false,
      );
    expect(
      hasCurrentPremiumSubscription(
        { ...current, price_id: "price_other_service" },
        now,
      ),
    ).toBe(false);
    expect(
      hasCurrentPremiumSubscription(
        { ...current, current_period_end: new Date(now).toISOString() },
        now,
      ),
    ).toBe(false);
    expect(
      hasCurrentPremiumSubscription(
        { ...current, current_period_start: "2026-12-01T00:00:00Z" },
        now,
      ),
    ).toBe(false);
    expect(
      hasCurrentPremiumSubscription(
        { ...current, current_period_end: null },
        now,
      ),
    ).toBe(false);
    expect(hasCurrentPremiumSubscription(null, now)).toBe(false);
  });
  it("fails closed when a server price has not been configured", () => {
    vi.stubEnv("STRIPE_PRICE_ID", "");
    expect(hasCurrentPremiumSubscription(current, now)).toBe(false);
  });
});

describe("Australian pay amounts", () => {
  it("preserves hourly cents and rejects excess precision or invalid amounts", () => {
    expect(moneyAmount.parse(32.5)).toBe(32.5);
    expect(moneyAmount.parse(125_500.25)).toBe(125_500.25);
    for (const invalid of [32.505, -1, 100_000_000.01, Infinity, NaN])
      expect(moneyAmount.safeParse(invalid).success).toBe(false);
  });
});
