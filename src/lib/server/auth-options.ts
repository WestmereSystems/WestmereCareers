import "server-only";
export async function authOptions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { google: false, azure: false };
  try {
    const r = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return { google: false, azure: false };
    const d = await r.json();
    return {
      google: d.external?.google === true,
      azure: d.external?.azure === true,
    };
  } catch {
    return { google: false, azure: false };
  }
}
