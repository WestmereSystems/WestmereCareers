import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}

/** State-changing browser requests must come from this application. */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.NEXT_PUBLIC_SITE_URL || request.url)
    .origin;
  if (
    !origin ||
    origin !== expected ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new ApiError(
      403,
      "This request must originate from Westmere Careers.",
      "INVALID_ORIGIN",
    );
  }
}

export function safeReturnPath(
  value: string | null | undefined,
  fallback = "/",
) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/u.test(value)
  )
    return fallback;
  const destination = new URL(value, "https://westmere.invalid");
  return destination.origin === "https://westmere.invalid"
    ? destination.pathname + destination.search + destination.hash
    : fallback;
}

export function applicationOrigin(request: Request) {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL || request.url).origin;
}

export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>,
  maxBytes = 60_000,
): Promise<T> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") || "",
    )
  ) {
    throw new ApiError(415, "Send a JSON request.", "UNSUPPORTED_MEDIA_TYPE");
  }
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes)
    throw new ApiError(413, "This request is too large.", "BODY_TOO_LARGE");
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "This request is too large.", "BODY_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(
      400,
      "This request contains invalid JSON.",
      "INVALID_JSON",
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(
      400,
      parsed.error.issues[0]?.message || "Check the supplied information.",
      "INVALID_INPUT",
    );
  return parsed.data;
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}

export function apiError(error: unknown) {
  if (error instanceof ApiError)
    return json({ error: error.message, code: error.code }, error.status);
  // Do not return database errors, tokens, personal documents or infrastructure details.
  return json(
    {
      error: "We could not complete that request. Please try again.",
      code: "INTERNAL_ERROR",
    },
    500,
  );
}
