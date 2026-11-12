import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Always request-scoped: never share a signed-in client between requests. */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        try {
          for (const { name, value, options } of values) {
            cookieStore.set(name, value, {
              ...options,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
            });
          }
        } catch {
          // Server Components cannot write cookies. The request proxy refreshes them first.
          // Every route using this client must remain dynamic and private/no-store.
        }
      },
    },
  });
}
