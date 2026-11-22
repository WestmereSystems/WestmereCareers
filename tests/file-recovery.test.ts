import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  openRecovery,
  sealRecovery,
  recoveryKey,
  recoveryHash,
} from "../src/lib/file-recovery-crypto";
const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  put: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  del: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: () => ({
    rpc: m.rpc,
    storage: {
      from: () => ({
        upload: m.upload,
        download: m.download,
        remove: m.remove,
      }),
    },
  }),
}));
vi.mock("@vercel/blob", () => ({
  put: m.put,
  get: m.get,
  list: m.list,
  del: m.del,
}));
import {
  backupFiles,
  restoreMissingFile,
} from "../src/lib/server/file-recovery";
const run = "a1000000-0000-4000-8000-000000000001",
  id = "b1000000-0000-4000-8000-000000000001",
  actor = "563e67cd-32d5-4e8c-a70a-2c0b51195bb6";
const originals = new Map<string, Uint8Array>(),
  copies = new Map<string, Uint8Array>();
const sourcePath = "synthetic-owner/document.pdf",
  original = Buffer.from("Synthetic private document bytes, not a real CV.");
let referenced = true;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FILE_RECOVERY_KEY_V1", "ab".repeat(32));
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "synthetic-fixture");
  originals.clear();
  copies.clear();
  referenced = true;
  originals.set(sourcePath, original);
  m.rpc.mockImplementation(async (name, args) => ({
    error: null,
    data:
      name === "file_recovery_inventory"
        ? [
            {
              id,
              bucket: "candidate-documents",
              path: sourcePath,
              updatedAt: new Date().toISOString(),
              mime: "application/pdf",
              bytes: original.length,
            },
          ]
        : name === "file_recovery_restore_allowed"
          ? referenced
          : args?.p_action === "acquire"
            ? run
            : {},
  }));
  m.put.mockImplementation(async (path, data, options) => {
    expect(options.access).toBe("private");
    expect(options.allowOverwrite).toBe(false);
    expect(options.ttlDays).toBeGreaterThan(0);
    copies.set(path, new Uint8Array(data));
    return { pathname: path };
  });
  m.get.mockImplementation(async (path) =>
    copies.has(path)
      ? {
          statusCode: 200,
          stream: new Blob([Uint8Array.from(copies.get(path)!)]).stream(),
        }
      : null,
  );
  m.del.mockImplementation(async (path) => {
    copies.delete(path);
  });
  m.upload.mockImplementation(async (path, data, options) => {
    if (originals.has(path) && !options.upsert)
      return { error: { message: "Already exists" } };
    originals.set(path, new Uint8Array(data));
    return { error: null };
  });
  m.download.mockImplementation(async (path) =>
    originals.has(path)
      ? { data: new Blob([Uint8Array.from(originals.get(path)!)]), error: null }
      : { data: null, error: { message: "Missing" } },
  );
  m.remove.mockImplementation(async (paths) => {
    for (const p of paths) originals.delete(p);
    return { error: null };
  });
});
afterEach(() => vi.unstubAllEnvs());
it("encrypts with fresh nonces and authenticates both content and destination", () => {
  const key = recoveryKey("ab".repeat(32)),
    a = sealRecovery(original, key, "files/a"),
    b = sealRecovery(original, key, "files/a");
  expect(a.equals(b)).toBe(false);
  expect(a.includes(original)).toBe(false);
  expect(openRecovery(a, key, "files/a")).toEqual(original);
  expect(() => openRecovery(a, key, "files/b")).toThrow();
  expect(() =>
    openRecovery(a, recoveryKey("cd".repeat(32)), "files/a"),
  ).toThrow();
  a[a.length - 1] ^= 1;
  expect(() => openRecovery(a, key, "files/a")).toThrow();
  expect(() => recoveryKey("short")).toThrow();
  expect(() => openRecovery(Buffer.from("bad"), key, "files/a")).toThrow();
});
it("only marks a complete snapshot after verified encrypted reads and a disposable delete/restore check", async () => {
  const result = await backupFiles(actor);
  expect(result).toMatchObject({
    files: 1,
    bytes: original.length,
    verified: true,
  });
  expect(copies.has(result.name)).toBe(true);
  expect(originals.size).toBe(1);
  expect(recoveryHash(originals.get(sourcePath)!)).toBe(recoveryHash(original));
  expect(m.rpc).toHaveBeenCalledWith(
    "file_recovery_control",
    expect.objectContaining({ p_action: "complete", p_actor: actor }),
  );
  expect(
    [...copies.values()].every((c) => !Buffer.from(c).includes(original)),
  ).toBe(true);
});
it("fails closed without creating a complete manifest if a source copy cannot be verified", async () => {
  m.get.mockResolvedValue(null);
  await expect(backupFiles()).rejects.toMatchObject({ status: 503 });
  expect([...copies.keys()].some((p) => p.startsWith("manifests/"))).toBe(
    false,
  );
  expect(m.rpc).toHaveBeenCalledWith(
    "file_recovery_control",
    expect.objectContaining({ p_action: "fail" }),
  );
});
it("restores only a missing referenced file and keeps an audit reason", async () => {
  const r = await backupFiles();
  originals.delete(sourcePath);
  await restoreMissingFile(
    r.name,
    id,
    "Recover an accidentally removed storage file",
    actor,
  );
  expect(Buffer.from(originals.get(sourcePath)!)).toEqual(original);
  expect(m.rpc).toHaveBeenCalledWith(
    "file_recovery_control",
    expect.objectContaining({
      p_action: "restore",
      p_actor: actor,
      p_detail: expect.objectContaining({
        reason: expect.stringContaining("accidentally"),
      }),
    }),
  );
});
it("does not overwrite an existing current file", async () => {
  const r = await backupFiles();
  const current = Buffer.from("Newer current bytes");
  originals.set(sourcePath, current);
  await expect(
    restoreMissingFile(r.name, id, "An incorrect restoration request", actor),
  ).rejects.toMatchObject({ status: 409 });
  expect(Buffer.from(originals.get(sourcePath)!)).toEqual(current);
});
it("does not resurrect a file whose document record was deleted", async () => {
  const r = await backupFiles();
  originals.delete(sourcePath);
  referenced = false;
  await expect(
    restoreMissingFile(r.name, id, "The reference no longer exists", actor),
  ).rejects.toMatchObject({ status: 409 });
  expect(originals.has(sourcePath)).toBe(false);
});
it("rejects corrupt encrypted file bytes before any restore upload", async () => {
  const r = await backupFiles(),
    path = [...copies.keys()].find((p) => p.startsWith("files/"))!;
  const damaged = copies.get(path)!;
  damaged[damaged.length - 1] ^= 1;
  originals.delete(sourcePath);
  m.upload.mockClear();
  await expect(
    restoreMissingFile(
      r.name,
      id,
      "Corrupt recovery copy should be refused",
      actor,
    ),
  ).rejects.toThrow();
  expect(m.upload).not.toHaveBeenCalled();
});
it("does not start a backup without its production encryption key", async () => {
  vi.stubEnv("FILE_RECOVERY_KEY_V1", "");
  await expect(backupFiles()).rejects.toMatchObject({ status: 503 });
  expect(m.rpc).not.toHaveBeenCalled();
});
