import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("@/lib/ads/context", () => ({ browserAdsState: mocks.state }));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: () => ({
    from: () => ({
      update: (values: unknown) => ({
        eq: () => ({ eq: () => mocks.update(values) }),
      }),
      insert: mocks.insert,
    }),
  }),
}));
import { GET, POST } from "../src/app/api/ads/context/route";
import { POST as acknowledge } from "../src/app/api/ads/registration/route";
const origin = "https://westmere.test",
  eventId = "91000000-0000-4000-8000-000000000001";
function request(body: unknown, source = origin) {
  return new Request(origin + "/api/ads/context", {
    method: "POST",
    headers: { origin: source, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
  mocks.state.mockResolvedValue({
    enabled: true,
    delivery: true,
    consent: { measurement: true, adUserData: true, enhanced: false },
    registration: { id: eventId, sendTo: "AW-123/fixture" },
  });
  mocks.update.mockResolvedValue({ error: null });
  mocks.insert.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("browser measurement API", () => {
  it("rejects cross-origin changes before reading or writing a context", async () => {
    expect(
      (await POST(request({ measurement: true }, "https://attacker.test")))
        .status,
    ).toBe(403);
    expect(mocks.state).not.toHaveBeenCalled();
  });
  it("rejects forged roles, values, event triggers and overlong identifiers", async () => {
    for (const body of [
      { measurement: true, userId: "someone" },
      { value: 9999 },
      { registered: true },
      { identifiers: { gclid: "x".repeat(513) } },
    ])
      expect((await POST(request(body))).status).toBe(400);
    expect(mocks.state).not.toHaveBeenCalled();
  });
  it("keeps a read/configuration failure optional and returns no conversion", async () => {
    mocks.state.mockRejectedValue(new Error("unavailable"));
    const response = await GET(new Request(origin + "/api/ads/context"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      delivery: false,
      registration: null,
    });
  });
  it("does not accept a fabricated receipt or missing current permission", async () => {
    expect(
      (
        await acknowledge(
          request({ eventId: "91000000-0000-4000-8000-000000000002" }),
        )
      ).status,
    ).toBe(403);
    mocks.state.mockResolvedValue({ delivery: false, registration: null });
    expect((await acknowledge(request({ eventId }))).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("records a legitimate tag callback as queued, never as accepted by Google", async () => {
    const response = await acknowledge(request({ eventId }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      recorded: true,
      acceptedByGoogle: false,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "tag_queued" }),
    );
  });
});
