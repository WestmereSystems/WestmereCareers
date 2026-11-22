import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
const m = vi.hoisted(() => ({
  session: vi.fn(),
  rpc: vi.fn(),
  backup: vi.fn(),
  status: vi.fn(),
  files: vi.fn(),
  restore: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireSession: m.session }));
vi.mock("@/lib/server/file-recovery", () => ({
  backupFiles: m.backup,
  recoveryStatus: m.status,
  recoveryFiles: m.files,
  restoreMissingFile: m.restore,
  manifestName: z.string().regex(/^manifests\/\d{13}-[a-f0-9-]{36}\.wmr$/),
}));
import { GET, POST } from "../src/app/api/admin/file-recovery/route";
import { GET as cron } from "../src/app/api/file-recovery/backup/route";
const owner = "563e67cd-32d5-4e8c-a70a-2c0b51195bb6",
  origin = "https://westmere.test";
const request = (body: unknown, site = origin) =>
  new Request(origin + "/api/admin/file-recovery", {
    method: "POST",
    headers: { origin: site, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
  vi.stubEnv("CRON_SECRET", "synthetic-cron");
  vi.stubEnv("FILE_RECOVERY_JOB_TOKEN", "synthetic-job");
  m.rpc.mockResolvedValue({ data: "admin", error: null });
  m.session.mockResolvedValue({
    user: { id: owner },
    supabase: { rpc: m.rpc },
  });
  m.status.mockResolvedValue({ configured: true, snapshots: [] });
  m.backup.mockResolvedValue({ files: 1, verified: true });
});
afterEach(() => vi.unstubAllEnvs());
it("refuses ordinary accounts and reviewers before using recovery services", async () => {
  for (const role of [null, "reviewer"]) {
    m.rpc.mockResolvedValue({ data: role, error: null });
    expect((await GET(new Request(origin))).status).toBe(403);
  }
  m.rpc.mockResolvedValue({ data: "admin", error: null });
  m.session.mockResolvedValue({
    user: { id: "another-admin" },
    supabase: { rpc: m.rpc },
  });
  expect((await POST(request({ action: "backup" }))).status).toBe(403);
  expect(m.backup).not.toHaveBeenCalled();
  expect(m.status).not.toHaveBeenCalled();
});
it("requires same-origin mutations and precise restore confirmation", async () => {
  expect(
    (await POST(request({ action: "backup" }, "https://other.test"))).status,
  ).toBe(403);
  expect(
    (
      await POST(
        request({
          action: "restore",
          snapshot: "https://attacker.test/copy",
          fileId: owner,
          reason: "Do not fetch arbitrary URLs",
          confirmation: "RESTORE MISSING FILE",
        }),
      )
    ).status,
  ).toBe(400);
  expect(m.restore).not.toHaveBeenCalled();
});
it("keeps the protected administrator status private and permits a manual backup", async () => {
  const r = await GET(new Request(origin));
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect((await POST(request({ action: "backup" }))).status).toBe(200);
  expect(m.backup).toHaveBeenCalledWith(owner);
});
it("does not let unauthenticated callers or forged job tokens trigger a backup", async () => {
  for (const auth of ["", "Bearer synthetic-joq", "Bearer undefined"]) {
    expect(
      (await cron(new Request(origin, { headers: { authorization: auth } })))
        .status,
    ).toBe(401);
  }
  expect(m.backup).not.toHaveBeenCalled();
});
it.each(["synthetic-cron", "synthetic-job"])(
  "permits the configured private backup credential %s",
  async (token) => {
    expect(
      (
        await cron(
          new Request(origin, {
            headers: { authorization: `Bearer ${token}` },
          }),
        )
      ).status,
    ).toBe(200);
    expect(m.backup).toHaveBeenCalledWith();
  },
);
