import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  reserve: vi.fn(),
  settle: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ getSessionContext: mocks.session }));
vi.mock("@/lib/premium/providers", () => ({
  openAIClient: () => ({ responses: { create: mocks.generate } }),
  premiumAdmin: () => ({ rpc: mocks.settle }),
}));
import { POST } from "../src/app/api/studio/route";

const payload = {
  mode: "improve",
  cv: "Experience leading customer onboarding projects and working with product and engineering teams to improve service delivery.",
  consent: true,
};
const output = {
  summary: "Clearer language",
  improvements: ["Explain the project scope using factual evidence."],
  revisedCv: payload.cv,
  coverLetter: "",
  matchedSkills: [],
  missingSkills: [],
};
function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/studio", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    supabase: { rpc: mocks.reserve },
    user: { id: "user-1" },
    isPremium: true,
  });
  mocks.reserve.mockResolvedValue({ data: "reservation-1", error: null });
  mocks.settle.mockResolvedValue({ error: null });
  mocks.generate.mockResolvedValue({
    status: "completed",
    output_text: JSON.stringify(output),
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("studio API security and cost controls", () => {
  it("rejects cross-origin requests before reading the session or sending CV text", async () => {
    expect(
      (await POST(request(payload, "https://unrelated.example"))).status,
    ).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    mocks.session.mockResolvedValue({
      supabase: { rpc: mocks.reserve },
      user: null,
      isPremium: false,
    });
    expect((await POST(request(payload))).status).toBe(401);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("rejects a client claiming premium without a paid server entitlement", async () => {
    mocks.session.mockResolvedValue({
      supabase: { rpc: mocks.reserve },
      user: { id: "user-1" },
      isPremium: false,
    });
    expect((await POST(request({ ...payload, isPremium: true }))).status).toBe(
      403,
    );
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("does not transmit CV text without explicit consent", async () => {
    expect((await POST(request({ ...payload, consent: false }))).status).toBe(
      400,
    );
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("does not call the model if the atomic quota reservation fails", async () => {
    mocks.reserve.mockResolvedValue({
      data: null,
      error: { message: "limit" },
    });
    expect((await POST(request(payload))).status).toBe(429);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("uses structured, non-stored output and settles successful usage", async () => {
    const response = await POST(request(payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      result: output,
      reservationId: "reservation-1",
    });
    expect(mocks.generate.mock.calls[0][0]).toMatchObject({
      store: false,
      max_output_tokens: 6500,
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(mocks.settle).toHaveBeenCalledWith("settle_ai_usage", {
      p_reservation_id: "reservation-1",
      p_success: true,
    });
  });
  it("refunds failed generation and hides raw provider errors", async () => {
    mocks.generate.mockRejectedValue(
      new Error("SECRET_PROVIDER_ERROR and personal CV contents"),
    );
    const response = await POST(request(payload));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      "SECRET_PROVIDER_ERROR",
    );
    expect(mocks.settle).toHaveBeenCalledWith("settle_ai_usage", {
      p_reservation_id: "reservation-1",
      p_success: false,
    });
  });
  it("handles refused/incomplete responses without returning a fabricated CV", async () => {
    mocks.generate.mockResolvedValue({ status: "completed", output_text: "" });
    const response = await POST(request(payload));
    expect(response.status).toBe(502);
    expect(await response.json()).not.toHaveProperty("result");
    expect(mocks.settle).toHaveBeenCalledWith("settle_ai_usage", {
      p_reservation_id: "reservation-1",
      p_success: false,
    });
  });
});
