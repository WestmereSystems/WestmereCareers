import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Called by the Next.js request proxy before rendering; propagates refresh cookies and cache headers. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (
    !url ||
    !key ||
    !request.cookies
      .getAll()
      .some(({ name }) => /^sb-.*-auth-token(?:\.\d+)?$/.test(name))
  )
    return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values)
          response.cookies.set(name, value, {
            ...options,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
          });
        for (const [name, value] of Object.entries(headers))
          response.headers.set(name, value);
      },
    },
  });
  // Optimistic local JWT validation/refresh only. Protected handlers call getUser()
  // and check database membership again; the proxy is not an authorisation gate.
  await supabase.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
