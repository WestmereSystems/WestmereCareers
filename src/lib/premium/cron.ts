import "server-only";
import { timingSafeEqual } from "node:crypto";

export function cronAuthorized(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || secret.length < 32 || !authorization) return false;
  const supplied = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${secret}`);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}
