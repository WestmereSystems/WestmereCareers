// These regressions exercise the public-launch behaviour; founding access has dedicated API/database coverage.
vi.mock("@/lib/server/launch", async () => import("./fixtures/open-launch"));
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  client: vi.fn(),
  send: vi.fn(),
  verify: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
import { POST as send } from "../src/app/api/auth/sign-in/route";
import { POST as verify } from "../src/app/api/auth/verify/route";
const origin = "https://westmere.test";
const request = (body: unknown) =>
  new Request(origin + "/api/auth/verify", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
  m.client.mockResolvedValue({
    auth: { signInWithOtp: m.send, verifyOtp: m.verify },
    from: m.from,
  });
  m.send.mockResolvedValue({ error: null });
  m.verify.mockResolvedValue({
    data: { user: { id: "candidate" }, session: {} },
    error: null,
  });
  m.read.mockResolvedValue({
    data: { full_name: "Existing name" },
    error: null,
  });
  m.upsert.mockResolvedValue({ error: null });
  m.from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: m.read }) }),
    upsert: m.upsert,
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("email-code sign-in", () => {
  it("sends codes without a magic-link redirect or reflected user data", async () => {
    const r = await send(
      request({ email: "Candidate@example.test", fullName: "Alex" }),
    );
    expect(r.status).toBe(200);
    expect(m.send).toHaveBeenCalledWith({
      email: "candidate@example.test",
      options: { shouldCreateUser: true, data: { full_name: "Alex" } },
    });
    expect((await r.json()).message).toContain("code");
  });
  it("verifies numeric codes and always lands on the private profile", async () => {
    const r = await verify(
      request({ email: "candidate@example.test", code: "123456" }),
    );
    expect(r.status).toBe(200);
    expect(m.verify).toHaveBeenCalledWith({
      email: "candidate@example.test",
      token: "123456",
      type: "email",
    });
    expect(await r.json()).toEqual({ redirect: "/account" });
  });
  it("rejects malformed codes before calling Auth", async () => {
    const r = await verify(
      request({
        email: "candidate@example.test",
        code: "https://example.test/link",
      }),
    );
    expect(r.status).toBe(400);
    expect(m.verify).not.toHaveBeenCalled();
  });
  it("does not overwrite an existing account name during sign-in", async () => {
    await verify(
      request({
        email: "candidate@example.test",
        code: "123456",
        fullName: "Someone else",
      }),
    );
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("adds a new profile name only after successful verification", async () => {
    m.read.mockResolvedValue({ data: null, error: null });
    await verify(
      request({
        email: "candidate@example.test",
        code: "123456",
        fullName: "Alex",
      }),
    );
    expect(m.upsert).toHaveBeenCalledWith({
      id: "candidate",
      full_name: "Alex",
    });
  });
  it("does not create a profile when a code is expired or invalid", async () => {
    m.verify.mockResolvedValue({
      data: { user: null, session: null },
      error: {},
    });
    expect(
      (
        await verify(
          request({
            email: "candidate@example.test",
            code: "123456",
            fullName: "Alex",
          }),
        )
      ).status,
    ).toBe(400);
    expect(m.from).not.toHaveBeenCalled();
  });
});
