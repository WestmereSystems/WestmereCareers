import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  session: vi.fn(),
  rpc: vi.fn(),
  adminRpc: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireSession: m.session }));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: () => ({ rpc: m.adminRpc }),
}));
import { ApiError } from "../src/lib/server/http";
import {
  GET as readPreference,
  POST as savePreference,
} from "../src/app/api/marketing/preferences/route";
import {
  GET as unsubscribeGet,
  POST as unsubscribe,
} from "../src/app/api/marketing/unsubscribe/route";
import {
  GET as register,
  POST as manual,
} from "../src/app/api/admin/marketing/route";
const origin = "https://westmere.com.au",
  token = "92000000-0000-4000-8000-000000000001";
const post = (path: string, body: unknown, requestOrigin = origin) =>
  new Request(origin + path, {
    method: "POST",
    headers: { origin: requestOrigin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
  m.session.mockResolvedValue({ supabase: { rpc: m.rpc } });
  m.rpc.mockResolvedValue({ data: { enabled: true }, error: null });
  m.adminRpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.unstubAllEnvs());
it("requires sign-in to read or save account preferences", async () => {
  m.session.mockRejectedValue(new ApiError(401, "Sign in required"));
  expect((await readPreference()).status).toBe(401);
  expect(
    (
      await savePreference(
        post("/api/marketing/preferences", { enabled: false }),
      )
    ).status,
  ).toBe(401);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("saves only the authenticated account choice and refuses cross-origin or extra identity fields", async () => {
  expect(
    (
      await savePreference(
        post("/api/marketing/preferences", { enabled: false }),
      )
    ).status,
  ).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith("save_marketing_preferences", {
    p_enabled: false,
  });
  m.rpc.mockClear();
  expect(
    (
      await savePreference(
        post("/api/marketing/preferences", {
          enabled: false,
          email: "another@example.org",
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await savePreference(
        post(
          "/api/marketing/preferences",
          { enabled: false },
          "https://another.example",
        ),
      )
    ).status,
  ).toBe(403);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("never changes a preference when a scanner reads the unsubscribe link", async () => {
  const response = await unsubscribeGet(
    new Request(origin + "/api/marketing/unsubscribe?token=" + token),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    origin + "/marketing/unsubscribe?token=" + token,
  );
  expect(m.adminRpc).not.toHaveBeenCalled();
});
it("supports no-login browser forms and RFC 8058 POST, without exposing the recipient", async () => {
  const response = await unsubscribe(
    new Request(origin + "/api/marketing/unsubscribe?token=" + token, {
      method: "POST",
      body: "List-Unsubscribe=One-Click",
    }),
  );
  expect(response.status).toBe(200);
  expect(m.session).not.toHaveBeenCalled();
  expect(m.adminRpc).toHaveBeenCalledWith("unsubscribe_marketing", {
    p_token: token,
  });
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).toContain("You’re unsubscribed.");
});
it("rejects invalid tokens and fails closed when the database refuses a valid-looking token", async () => {
  expect(
    (
      await unsubscribe(
        new Request(origin + "/api/marketing/unsubscribe?token=bad", {
          method: "POST",
        }),
      )
    ).status,
  ).toBe(400);
  expect(m.adminRpc).not.toHaveBeenCalled();
  m.adminRpc.mockResolvedValue({
    error: { code: "22023", message: "sensitive database details" },
  });
  const response = await unsubscribe(
    new Request(origin + "/api/marketing/unsubscribe?token=" + token, {
      method: "POST",
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain("sensitive");
  m.adminRpc.mockResolvedValue({ error: { code: "08006" } });
  expect(
    (
      await unsubscribe(
        new Request(origin + "/api/marketing/unsubscribe?token=" + token, {
          method: "POST",
        }),
      )
    ).status,
  ).toBe(503);
});
it("restricts register reads and manual suppression to administrators", async () => {
  m.rpc.mockResolvedValue({ data: "moderator", error: null });
  expect(
    (await register(new Request(origin + "/api/admin/marketing"))).status,
  ).toBe(403);
  expect(
    (
      await manual(
        post("/api/admin/marketing", {
          email: "target@example.org",
          reason: "Requested removal by phone",
        }),
      )
    ).status,
  ).toBe(403);
  expect(m.rpc.mock.calls.every(([name]) => name === "my_staff_role")).toBe(
    true,
  );
});
it("normalises manual addresses, validates reasons and limits list pages", async () => {
  m.rpc.mockImplementation(async (name) => ({
    data: name === "my_staff_role" ? "admin" : { rows: [], total: 0 },
    error: null,
  }));
  expect(
    (
      await manual(
        post("/api/admin/marketing", {
          email: "TARGET@Example.org",
          reason: "Requested removal by phone",
        }),
      )
    ).status,
  ).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith("admin_marketing_contacts", {
    p_action: "suppress",
    p_email: "target@example.org",
    p_reason: "Requested removal by phone",
  });
  expect(
    (
      await manual(
        post("/api/admin/marketing", {
          email: "target@example.org",
          reason: "short",
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (await register(new Request(origin + "/api/admin/marketing?offset=1")))
      .status,
  ).toBe(400);
});
