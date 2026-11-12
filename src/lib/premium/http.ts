import "server-only";
import { NextResponse } from "next/server";

export class PremiumError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function premiumError(error: unknown): NextResponse {
  if (error instanceof PremiumError)
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  // Provider messages can contain request data, API metadata or identifiers.
  return NextResponse.json(
    {
      error:
        "This service is temporarily unavailable. Please try again shortly.",
      code: "SERVICE_UNAVAILABLE",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export function siteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw new PremiumError(
        "INVALID_CONFIGURATION",
        "The service is not configured yet.",
        503,
      );
    return url.origin;
  }
  const url = new URL(request.url);
  if (
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    return url.origin;
  throw new PremiumError(
    "NOT_CONFIGURED",
    "The service is not configured yet.",
    503,
  );
}

export function requireOrigin(request: Request): string {
  const origin = siteOrigin(request);
  if (request.headers.get("origin") !== origin)
    throw new PremiumError(
      "INVALID_ORIGIN",
      "Please make this request from Westmere Careers.",
      403,
    );
  return origin;
}

export async function boundedJson(
  request: Request,
  maxBytes = 70000,
): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes)
    throw new PremiumError("TOO_LARGE", "The supplied text is too long.", 413);
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new PremiumError(
      "INVALID_CONTENT_TYPE",
      "A JSON request is required.",
      415,
    );
  if (!request.body)
    throw new PremiumError("INVALID_REQUEST", "The request body is missing.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new PremiumError(
          "TOO_LARGE",
          "The supplied text is too long.",
          413,
        );
      }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch (error) {
    if (error instanceof PremiumError) throw error;
    throw new PremiumError("INVALID_JSON", "The request is not valid JSON.");
  } finally {
    reader.releaseLock();
  }
}
