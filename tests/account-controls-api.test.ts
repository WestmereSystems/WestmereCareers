import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  user: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
  staff: vi.fn(),
  archive: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: () => ({ rpc: m.rpc }),
}));
vi.mock("@/lib/server/account-export", () => ({ accountArchive: m.archive }));
vi.mock("@/lib/server/auth", () => ({ requireSession: m.session }));
import { GET, POST } from "../src/app/api/account/privacy/route";
import { POST as exportAccount } from "../src/app/api/account/export/route";
import {
  GET as adminGet,
  POST as adminPost,
} from "../src/app/api/admin/account-privacy/route";
import { PATCH as withdraw } from "../src/app/api/employers/verification/route";
import { ApiError } from "../src/lib/server/http";
const id = "91000000-0000-4000-8000-000000000001",
  requestId = "92000000-0000-4000-8000-000000000001",
  origin = "https://westmere.test",
  version = "2026-11-22T10:00:00Z";
function req(path: string, body: unknown, site = origin, method = "POST") {
  return new Request(origin + path, {
    method,
    headers: { origin: site, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
  m.user.mockResolvedValue({
    data: {
      user: { id, email: "own@example.test", email_confirmed_at: version },
    },
    error: null,
  });
  m.staff.mockResolvedValue({ data: "admin", error: null });
  m.client.mockResolvedValue({ auth: { getUser: m.user }, rpc: m.staff });
  m.rpc.mockResolvedValue({
    data: { requests: [], email: "own@example.test" },
    error: null,
  });
  m.archive.mockResolvedValue(new Uint8Array([80, 75, 3, 4]));
  m.session.mockResolvedValue({ user: { id }, supabase: { rpc: m.rpc } });
});
afterEach(() => vi.unstubAllEnvs());
it("requires verified Auth identity for privacy and downloads even when marketplace admission is separate", async () => {
  m.user.mockResolvedValue({ data: { user: null }, error: null });
  expect((await GET()).status).toBe(401);
  expect(
    (await exportAccount(req("/api/account/export", { confirmation: true })))
      .status,
  ).toBe(401);
  expect(m.rpc).not.toHaveBeenCalled();
  m.user.mockResolvedValue({
    data: { user: { id, email: "own@example.test" } },
    error: null,
  });
  expect((await GET()).status).toBe(403);
});
it("derives the account identity from Auth and never accepts a caller-selected user or email", async () => {
  expect(
    (
      await POST(
        req("/api/account/privacy", {
          action: "request",
          kind: "deletion",
          confirmation: true,
          userId: "another",
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        req("/api/account/privacy", {
          action: "request",
          kind: "deletion",
          details: "Review my retained records",
          confirmation: true,
        }),
      )
    ).status,
  ).toBe(201);
  expect(m.rpc).toHaveBeenCalledWith(
    "account_privacy_request",
    expect.objectContaining({
      p_user: id,
      p_action: "request",
      p_kind: "deletion",
    }),
  );
  expect(m.session).not.toHaveBeenCalled();
  const r = await GET();
  expect(r.headers.get("cache-control")).toContain("no-store");
});
it("rejects cross-origin privacy, export and verification mutations before performing them", async () => {
  for (const [fn, path, body] of [
    [
      POST,
      "/api/account/privacy",
      { action: "request", kind: "deletion", confirmation: true },
    ],
    [exportAccount, "/api/account/export", { confirmation: true }],
    [
      withdraw,
      "/api/employers/verification",
      { id: requestId, version, confirmation: true },
    ],
  ] as const)
    expect((await fn(req(path, body, "https://other.test"))).status).toBe(403);
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.archive).not.toHaveBeenCalled();
});
it("returns a private streamed ZIP only after explicit same-origin download confirmation", async () => {
  expect((await exportAccount(req("/api/account/export", {}))).status).toBe(
    400,
  );
  const r = await exportAccount(
    req("/api/account/export", { confirmation: true }),
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toBe("application/zip");
  expect(r.headers.get("content-disposition")).toContain("attachment;");
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(new Uint8Array(await r.arrayBuffer())).toEqual(
    new Uint8Array([80, 75, 3, 4]),
  );
});
it("lets only an enabled Admin reach the private queue and supplies the trusted actor", async () => {
  for (const role of [null, "reviewer", "employer"]) {
    m.staff.mockResolvedValue({ data: role, error: null });
    expect((await adminGet(new Request(origin))).status).toBe(403);
  }
  expect(m.rpc).not.toHaveBeenCalled();
  m.staff.mockResolvedValue({ data: "admin", error: null });
  const r = await adminPost(
    req("/api/admin/account-privacy", {
      id: requestId,
      version,
      status: "in_review",
      response: "We are assessing the requested records.",
    }),
  );
  expect(r.status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith(
    "admin_account_privacy",
    expect.objectContaining({
      p_actor: id,
      p_id: requestId,
      p_status: "in_review",
    }),
  );
});
it("maps stale decisions and rate limits to safe actionable responses", async () => {
  m.rpc.mockResolvedValue({ error: { code: "40001" }, data: null });
  expect(
    (
      await POST(
        req("/api/account/privacy", {
          action: "withdraw",
          id: requestId,
          version,
        }),
      )
    ).status,
  ).toBe(409);
  m.rpc.mockResolvedValue({ error: { code: "P0001" }, data: null });
  expect(
    (
      await POST(
        req("/api/account/privacy", {
          action: "request",
          kind: "deletion",
          confirmation: true,
        }),
      )
    ).status,
  ).toBe(429);
});
it("validates and versions verification withdrawal without requiring a new Terms acceptance", async () => {
  const r = await withdraw(
    req(
      "/api/employers/verification",
      { id: requestId, version, confirmation: true },
      origin,
      "PATCH",
    ),
  );
  expect(r.status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith("withdraw_business_verification", {
    p_id: requestId,
    p_version: version,
    p_reason: "",
  });
  m.rpc.mockResolvedValue({ error: { code: "40001" }, data: null });
  expect(
    (
      await withdraw(
        req(
          "/api/employers/verification",
          { id: requestId, version, confirmation: true },
          origin,
          "PATCH",
        ),
      )
    ).status,
  ).toBe(409);
});
it("does not expose archive failures or allow a supplied target in a download request", async () => {
  expect(
    (
      await exportAccount(
        req("/api/account/export", { confirmation: true, user: id }),
      )
    ).status,
  ).toBe(400);
  m.archive.mockRejectedValue(
    new ApiError(413, "Request a complete copy.", "EXPORT_REVIEW_REQUIRED"),
  );
  const r = await exportAccount(
    req("/api/account/export", { confirmation: true }),
  );
  expect(r.status).toBe(413);
  expect(await r.json()).toMatchObject({ code: "EXPORT_REVIEW_REQUIRED" });
});
