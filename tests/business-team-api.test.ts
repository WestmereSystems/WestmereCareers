import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireSession: mocks.session }));
import { GET, POST } from "../src/app/api/employers/team/route";
const org = "20000000-0000-4000-8000-000000000001",
  member = "10000000-0000-4000-8000-000000000002",
  invitation = "40000000-0000-4000-8000-000000000001";
function request(body: unknown, origin = "https://westmere.test") {
  return new Request("https://westmere.test/api/employers/team", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://westmere.test");
  mocks.session.mockResolvedValue({ supabase: { rpc: mocks.rpc } });
  mocks.rpc.mockResolvedValue({
    data: { teams: [], invitations: [] },
    error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
it("loads only the authenticated caller’s team data", async () => {
  expect((await GET()).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("manage_business_team", {
    p_action: "list",
  });
});
it.each([
  { action: "invite", organisationId: org, email: "team@example.test" },
  { action: "accept", invitationId: invitation },
  { action: "revoke", organisationId: org, memberId: member },
  { action: "revoke", organisationId: org, invitationId: invitation },
])("accepts the explicit $action request shape", async (body) => {
  expect((await POST(request(body))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("rejects cross-origin and ambiguous revocation before accessing accounts", async () => {
  expect(
    (
      await POST(
        request(
          { action: "revoke", organisationId: org, memberId: member },
          "https://other.test",
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await POST(
        request({
          action: "revoke",
          organisationId: org,
          memberId: member,
          invitationId: invitation,
        }),
      )
    ).status,
  ).toBe(400);
  expect(mocks.session).not.toHaveBeenCalled();
});
it("preserves database denial and avoids exposing internal failures", async () => {
  mocks.rpc.mockResolvedValue({
    error: {
      code: "42501",
      message: "Only the business creator can manage its team",
    },
  });
  expect(
    (
      await POST(
        request({
          action: "invite",
          organisationId: org,
          email: "team@example.test",
        }),
      )
    ).status,
  ).toBe(403);
  mocks.rpc.mockResolvedValue({
    error: { code: "XX000", message: "private internal detail" },
  });
  const result = await POST(
    request({ action: "accept", invitationId: invitation }),
  );
  expect(result.status).toBe(503);
  expect(await result.text()).not.toContain("private internal detail");
});
