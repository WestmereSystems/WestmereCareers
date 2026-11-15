import { getSessionContext } from "@/lib/server/auth";
import { apiError, json } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { supabase, user, isPremium } = await getSessionContext();
    const staff = user && supabase ? await supabase.rpc("my_staff_role") : null;
    return json({
      configured: Boolean(supabase),
      user: user ? { id: user.id, email: user.email } : null,
      isPremium,
      staffRole: staff?.error ? null : (staff?.data ?? null),
    });
  } catch (error) {
    return apiError(error);
  }
}
