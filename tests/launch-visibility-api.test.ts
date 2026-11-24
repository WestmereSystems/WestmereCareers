import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireSession: mocks.requireSession }));
import { GET, POST } from "../src/app/api/employers/launch/route";
const id = "72000000-0000-4000-8000-000000000001";
const request = (body: unknown, origin = "https://westmere.test") =>
  new Request("https://westmere.test/api/employers/launch", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://westmere.test");
  mocks.requireSession.mockResolvedValue({ supabase: { rpc: mocks.rpc } });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});
it("rejects a cross-origin visibility change before accessing the account", async () => {
  expect(
    (
      await POST(
        request(
          { id, kind: "profile", action: "withdraw" },
          "https://untrusted.test",
        ),
      )
    ).status,
  ).toBe(403);
  expect(mocks.requireSession).not.toHaveBeenCalled();
});
it("does not accept obsolete business-wide publication switches", async () => {
  expect(
    (await POST(request({ id, kind: "business_jobs", action: "consent" })))
      .status,
  ).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("returns the ownership failure without claiming a visibility change was saved", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
  const result = await POST(
    request({ id, kind: "profile", action: "withdraw" }),
  );
  expect(result.status).toBe(403);
  expect(await result.json()).toHaveProperty("error");
});
it("explains that excluding a role closes it and that it can be republished", async () => {
  const result = await POST(request({ id, kind: "job", action: "withdraw" }));
  expect(result.status).toBe(200);
  expect((await result.json()).message).toMatch(/closed.*republish/i);
});
it("returns server visibility decisions for the account without inferring public access from consent", async () => {
  const content = {
    profiles: [
      { id, publicationAllowed: true, public: false, consentedAt: null },
    ],
    jobs: [],
  };
  mocks.rpc.mockResolvedValue({ data: content, error: null });
  expect(await (await GET()).json()).toEqual(content);
});
