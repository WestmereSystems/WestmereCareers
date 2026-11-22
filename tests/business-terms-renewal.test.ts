import { beforeEach, afterEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  session: vi.fn(),
  admin: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  result: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireSession: m.session }));
vi.mock("@/lib/premium/providers", () => ({ premiumAdmin: m.admin }));
import { POST } from "../src/app/api/employers/terms/route";
import terms from "../src/content/terms-and-conditions.json";
const origin = "https://westmere.test";
const request = (body: unknown, from = origin) =>
  new Request(origin + "/api/employers/terms", {
    method: "POST",
    headers: { origin: from, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
  m.session.mockResolvedValue({
    user: {
      id: "owner",
      email_confirmed_at: "2026-11-17",
      last_sign_in_at: "2026-11-17",
    },
    business: { kind: "employer" },
  });
  const query = { eq: m.eq, select: () => query, maybeSingle: m.result };
  m.update.mockReturnValue(query);
  m.eq.mockReturnValue(query);
  m.result.mockResolvedValue({ data: { user_id: "owner" }, error: null });
  m.admin.mockReturnValue({ from: () => ({ update: m.update }) });
});
afterEach(() => vi.unstubAllEnvs());
it("renews only Terms fields for an authenticated existing business without changing its identity or billing", async () => {
  const response = await POST(
    request({ termsAccepted: true, termsVersion: terms.version }),
  );
  expect(response.status).toBe(200);
  expect(m.eq).toHaveBeenCalledWith("user_id", "owner");
  expect(Object.keys(m.update.mock.calls[0][0]).sort()).toEqual([
    "accepted_at",
    "terms_sha256",
    "terms_version",
  ]);
  expect(m.update.mock.calls[0][0].terms_version).toBe(terms.version);
});
it("requires explicit current-version agreement and same-origin submission", async () => {
  expect(
    (await POST(request({ termsAccepted: false, termsVersion: terms.version })))
      .status,
  ).toBe(400);
  expect(
    (await POST(request({ termsAccepted: true, termsVersion: "old" }))).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request(
          { termsAccepted: true, termsVersion: terms.version },
          "https://other.test",
        ),
      )
    ).status,
  ).toBe(403);
  expect(m.update).not.toHaveBeenCalled();
});
it("rejects a personal account or an unverified email", async () => {
  m.session.mockResolvedValue({
    user: { id: "personal", email_confirmed_at: "2026-11-17" },
    business: null,
  });
  expect(
    (await POST(request({ termsAccepted: true, termsVersion: terms.version })))
      .status,
  ).toBe(403);
  m.session.mockResolvedValue({
    user: { id: "owner" },
    business: { kind: "employer" },
  });
  expect(
    (await POST(request({ termsAccepted: true, termsVersion: terms.version })))
      .status,
  ).toBe(403);
  expect(m.update).not.toHaveBeenCalled();
});
