import "server-only";
import { randomUUID } from "node:crypto";
import { put, get, list, del } from "@vercel/blob";
import { z } from "zod";
import { premiumAdmin } from "@/lib/premium/providers";
import {
  recoveryKey,
  recoveryHash,
  sealRecovery,
  openRecovery,
} from "@/lib/file-recovery-crypto";
import { ApiError } from "./http";

const bucket = z.enum([
  "candidate-documents",
  "application-documents",
  "employer-assets",
]);
const source = z.object({
  id: z.uuid(),
  bucket,
  path: z
    .string()
    .min(1)
    .max(2000)
    .refine(
      (p) =>
        !p.startsWith("/") &&
        !p.includes("\\") &&
        !p.split("/").some((s) => s === ".." || s === ".") &&
        !/[\x00-\x1f]/.test(p),
    ),
  updatedAt: z.string(),
  mime: z.string().min(1).max(150),
  bytes: z.number().int().min(0).max(10485760),
});
const file = source.extend({
  copy: z.string().regex(/^files\/[a-f0-9-]{36}\/\d+\.wmr$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const manifestSchema = z
  .object({
    version: z.literal(1),
    runId: z.uuid(),
    createdAt: z.iso.datetime(),
    files: z.array(file).max(5000),
  })
  .strict();
export const manifestName = z
  .string()
  .regex(/^manifests\/\d{13}-[a-f0-9-]{36}\.wmr$/);
type Manifest = z.infer<typeof manifestSchema>;
const maxBytes = 10485760;
const key = () => recoveryKey(process.env.FILE_RECOVERY_KEY_V1);
export const recoveryConfigured = () =>
  Boolean(
    /^[a-f0-9]{64}$/i.test(process.env.FILE_RECOVERY_KEY_V1 || "") &&
    (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
  );
async function control(
  action: string,
  detail: unknown = {},
  token?: string,
  actor?: string,
) {
  const r = await premiumAdmin().rpc("file_recovery_control", {
    p_action: action,
    p_token: token || null,
    p_actor: actor || null,
    p_detail: detail,
  });
  if (r.error) throw new ApiError(503, "Recovery status could not be saved.");
  return r.data;
}
async function readCopy(path: string, limit = maxBytes + 32) {
  const r = await get(path, {
    access: "private",
    useCache: false,
    abortSignal: AbortSignal.timeout(20000),
  });
  if (!r || r.statusCode !== 200)
    throw new ApiError(404, "Recovery copy is unavailable.");
  const reader = r.stream.getReader();
  let size = 0;
  const chunks: Buffer[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError(413, "Recovery copy exceeds its size limit.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}
async function writeCopy(path: string, data: Uint8Array, days = 31) {
  await put(path, sealRecovery(data, key(), path), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/octet-stream",
    ttlDays: days,
    abortSignal: AbortSignal.timeout(20000),
  });
  const verified = openRecovery(
    await readCopy(path, Math.max(maxBytes + 32, data.length + 32)),
    key(),
    path,
  );
  if (recoveryHash(verified) !== recoveryHash(data))
    throw new Error("RECOVERY_VERIFICATION_FAILED");
}
async function readManifest(path: string): Promise<Manifest> {
  manifestName.parse(path);
  return manifestSchema.parse(
    JSON.parse(
      openRecovery(await readCopy(path, 8 * 1024 * 1024), key(), path).toString(
        "utf8",
      ),
    ),
  );
}
export async function recoveryStatus() {
  const status = await control("status");
  if (!recoveryConfigured())
    return { configured: false, status, snapshots: [] };
  const snapshots = await list({
    prefix: "manifests/",
    limit: 100,
    abortSignal: AbortSignal.timeout(15000),
  });
  return {
    configured: true,
    status,
    snapshots: snapshots.blobs
      .map((b) => ({
        name: b.pathname,
        createdAt: b.uploadedAt,
        expiresAt: new Date(
          new Date(b.uploadedAt).getTime() + 30 * 86400000,
        ).toISOString(),
      }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
  };
}
export async function recoveryFiles(name: string) {
  const m = await readManifest(name);
  return {
    createdAt: m.createdAt,
    files: m.files.map((f) => ({
      id: f.id,
      bucket: f.bucket,
      path: f.path,
      bytes: f.bytes,
      updatedAt: f.updatedAt,
    })),
  };
}
export async function verifyRecoveryRoundTrip() {
  const id = randomUUID(),
    path = `__recovery_verify__/${id}.txt`,
    copy = `verification/${id}.wmr`,
    db = premiumAdmin();
  // Inert synthetic text uses a MIME type allowed by the private document bucket.
  // It has no document or account record and is removed after the restore check.
  const bytes = Buffer.from("Westmere private file recovery verification.\n");
  let created = false;
  try {
    const initial = await db.storage
      .from("candidate-documents")
      .upload(path, bytes, { contentType: "text/plain", upsert: false });
    if (initial.error) throw new Error("RESTORE_CHECK_UPLOAD_FAILED");
    created = true;
    await writeCopy(copy, bytes, 1);
    const removed = await db.storage.from("candidate-documents").remove([path]);
    if (removed.error) throw new Error("RESTORE_CHECK_DELETE_FAILED");
    const restored = openRecovery(await readCopy(copy), key(), copy);
    const upload = await db.storage
      .from("candidate-documents")
      .upload(path, restored, { contentType: "text/plain", upsert: false });
    if (upload.error) throw new Error("RESTORE_CHECK_FAILED");
    const downloaded = await db.storage
      .from("candidate-documents")
      .download(path);
    if (
      downloaded.error ||
      !downloaded.data ||
      recoveryHash(new Uint8Array(await downloaded.data.arrayBuffer())) !==
        recoveryHash(bytes)
    )
      throw new Error("RESTORE_CHECK_FAILED");
    return true;
  } finally {
    if (created) {
      const cleanup = await db.storage
        .from("candidate-documents")
        .remove([path]);
      if (cleanup.error) throw new Error("RESTORE_CHECK_CLEANUP_FAILED");
    }
    await del(copy).catch(() => undefined);
  }
}
export async function backupFiles(actor?: string) {
  if (!recoveryConfigured())
    throw new ApiError(503, "File recovery is not configured.");
  const token = await control("acquire");
  if (typeof token !== "string")
    throw new ApiError(409, "A file backup is already running.");
  const deadline = performance.now() + 240000,
    db = premiumAdmin();
  let stage = "inventory";
  try {
    const inventory = await db.rpc("file_recovery_inventory");
    if (inventory.error) throw new Error("INVENTORY_UNAVAILABLE");
    const sources = z.array(source).max(5000).parse(inventory.data),
      files: Manifest["files"] = [];
    stage = "file_copies";
    for (const [i, s] of sources.entries()) {
      if (performance.now() > deadline) throw new Error("RECOVERY_RUN_TIMEOUT");
      const original = await db.storage.from(s.bucket).download(s.path);
      if (original.error || !original.data)
        throw new Error("SOURCE_UNAVAILABLE");
      if (original.data.size > maxBytes) throw new Error("SOURCE_TOO_LARGE");
      const bytes = new Uint8Array(await original.data.arrayBuffer());
      const copy = `files/${token}/${i}.wmr`;
      await writeCopy(copy, bytes);
      files.push({
        ...s,
        bytes: bytes.length,
        copy,
        sha256: recoveryHash(bytes),
      });
    }
    stage = "restore_check";
    const verified = await verifyRecoveryRoundTrip(),
      name = `manifests/${Date.now()}-${token}.wmr`;
    const manifest: Manifest = {
      version: 1,
      runId: token,
      createdAt: new Date().toISOString(),
      files,
    };
    stage = "manifest";
    await writeCopy(name, Buffer.from(JSON.stringify(manifest)), 30);
    const result = {
      name,
      files: files.length,
      bytes: files.reduce((n, f) => n + f.bytes, 0),
      verified,
    };
    stage = "record_completion";
    await control("complete", result, token, actor);
    return result;
  } catch {
    console.error("File recovery incomplete", { stage });
    await control("fail", { stage }, token, actor).catch(() => undefined);
    throw new ApiError(
      503,
      "File backup did not complete. Previous recovery copies remain available.",
    );
  }
}
export async function restoreMissingFile(
  name: string,
  id: string,
  reason: string,
  actor: string,
) {
  const m = await readManifest(name),
    entry = m.files.find((f) => f.id === id);
  if (!entry) throw new ApiError(404, "Choose a file in this recovery copy.");
  const db = premiumAdmin(),
    allowed = await db.rpc("file_recovery_restore_allowed", {
      p_bucket: entry.bucket,
      p_path: entry.path,
    });
  if (allowed.error || allowed.data !== true)
    throw new ApiError(
      409,
      "The original document or business reference has been removed. Restore its database record through the documented recovery process first; do not undo a deletion request.",
    );
  const bytes = openRecovery(await readCopy(entry.copy), key(), entry.copy);
  if (bytes.length !== entry.bytes || recoveryHash(bytes) !== entry.sha256)
    throw new ApiError(409, "Recovery integrity check failed.");
  // Never overwrite a current file, even if another request creates it concurrently.
  const upload = await db.storage
    .from(entry.bucket)
    .upload(entry.path, bytes, { contentType: entry.mime, upsert: false });
  if (upload.error)
    throw new ApiError(
      409,
      "The file already exists or cannot be restored. Current files are never overwritten.",
    );
  const stillAllowed = await db.rpc("file_recovery_restore_allowed", {
    p_bucket: entry.bucket,
    p_path: entry.path,
  });
  if (!stillAllowed.error && stillAllowed.data !== true) {
    await db.storage.from(entry.bucket).remove([entry.path]);
    throw new ApiError(
      409,
      "The document reference changed during recovery. The restored copy has been removed.",
    );
  }
  const readback = await db.storage.from(entry.bucket).download(entry.path);
  if (
    stillAllowed.error ||
    readback.error ||
    !readback.data ||
    recoveryHash(new Uint8Array(await readback.data.arrayBuffer())) !==
      entry.sha256
  )
    throw new ApiError(
      503,
      "Restoration could not be verified. Check the recovery audit before attempting another operation.",
    );
  await control(
    "restore",
    { manifest: name, fileId: entry.id, bucket: entry.bucket, reason },
    undefined,
    actor,
  );
  return {
    message:
      "Missing file restored. Its existing document record is unchanged.",
  };
}
