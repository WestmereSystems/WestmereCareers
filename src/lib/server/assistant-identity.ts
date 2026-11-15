import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { PremiumError } from "@/lib/premium/http";

export const guestCookie = "westmere-ai-preview";
const hash = (key: string, value: string) =>
  createHmac("sha256", key).update(value).digest("hex");
export function readGuestToken(value: string | undefined, secret: string) {
  if (!value || !/^[a-f0-9-]{36}\.[a-f0-9]{64}$/i.test(value)) return null;
  const [id, signature] = value.split(".");
  const expected = hash(secret, `guest-cookie:${id}`);
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex"),
  )
    ? id
    : null;
}
export function assistantIdentity(
  cookie: string | undefined,
  userId: string | null,
  request: Request,
  secret: string,
) {
  if (!secret)
    throw new PremiumError(
      "NOT_CONFIGURED",
      "AI assistance is being prepared. Your CV has not been sent anywhere.",
      503,
    );
  const id = userId || readGuestToken(cookie, secret) || randomUUID();
  const tier = userId ? "account" : "guest";
  const forwarded = (
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for") ||
    ""
  )
    .split(",")[0]
    .trim();
  // Vercel supplies the originating IP. No raw IP or CV text is stored in the quota ledger.
  const source = isIP(forwarded) ? forwarded : "unavailable";
  return {
    tier,
    principal: hash(secret, `${tier}:${id}`),
    abuse: hash(
      secret,
      `daily:${new Date().toISOString().slice(0, 10)}:${source}`,
    ),
    token: `${id}.${hash(secret, `guest-cookie:${id}`)}`,
    cap: userId ? 3 : 1,
  };
}
