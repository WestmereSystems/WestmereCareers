import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./http";

export const businessOAuthCookie = "wm-business-oauth";
export const businessOAuthCookiePath = "/auth/callback";
const intent = z
  .object({
    kind: z.enum(["employer", "agency"]),
    provider: z.enum(["google", "azure"]),
    expiresAt: z.number().int(),
    nonce: z.string().regex(/^[a-f0-9]{32}$/),
  })
  .strict();
function signature(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`business-oauth-v1:${payload}`)
    .digest("base64url");
}
export function createBusinessOAuthIntent(
  kind: "employer" | "agency",
  provider: "google" | "azure",
) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new ApiError(503, "Business sign-in is being prepared.");
  const payload = Buffer.from(
    JSON.stringify({
      kind,
      provider,
      expiresAt: Date.now() + 900_000,
      nonce: randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}
export function readBusinessOAuthIntent(request: Request) {
  const token = (request.headers.get("cookie") || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${businessOAuthCookie}=`))
    ?.slice(businessOAuthCookie.length + 1);
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || token.length > 1024 || !secret) return null;
  try {
    const [payload, sig, ...extra] = token.split(".");
    if (extra.length || !payload || !sig || !/^[a-zA-Z0-9_-]+$/.test(payload))
      return null;
    const expected = signature(payload, secret);
    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    )
      return null;
    const value = intent.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (value.expiresAt <= Date.now() || value.expiresAt > Date.now() + 960_000)
      return null;
    return value;
  } catch {
    return null;
  }
}
