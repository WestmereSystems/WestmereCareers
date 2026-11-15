import { getSessionContext } from "@/lib/server/auth";
import { apiError, json } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { supabase, user, isPremium } = await getSessionContext();
    const [staff, profile, sample] =
      user && supabase
        ? await Promise.all([
            supabase.rpc("my_staff_role"),
            supabase
              .from("profiles")
              .select("full_name")
              .eq("id", user.id)
              .maybeSingle(),
            supabase.rpc("my_sample_workspace"),
          ])
        : [null, null, null];
    return json({
      configured: Boolean(supabase),
      user: user
        ? {
            id: user.id,
            email: user.email,
            fullName: profile?.data?.full_name || "",
          }
        : null,
      isPremium,
      sampleWorkspace: sample?.data === true,
      staffRole: staff?.error ? null : (staff?.data ?? null),
    });
  } catch (e) {
    return apiError(e);
  }
}
