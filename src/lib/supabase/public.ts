import "server-only";
import { createClient } from "@supabase/supabase-js";
/** Stateless anonymous inventory reads. Never attach session cookies or use for private records. */
export function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key
    ? createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
        },
      })
    : null;
}
