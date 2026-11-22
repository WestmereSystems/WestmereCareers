import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
const magic = Buffer.from("WMR1");
export function recoveryKey(hex: string | undefined) {
  if (!hex || !/^[a-f0-9]{64}$/i.test(hex))
    throw new Error("RECOVERY_NOT_CONFIGURED");
  return Buffer.from(hex, "hex");
}
export const recoveryHash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export function sealRecovery(bytes: Uint8Array, key: Buffer, context: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), data]);
}
export function openRecovery(bytes: Uint8Array, key: Buffer, context: string) {
  const data = Buffer.from(bytes);
  if (data.length < 32 || !data.subarray(0, 4).equals(magic))
    throw new Error("INVALID_RECOVERY_COPY");
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(4, 16));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(data.subarray(16, 32));
  return Buffer.concat([decipher.update(data.subarray(32)), decipher.final()]);
}
