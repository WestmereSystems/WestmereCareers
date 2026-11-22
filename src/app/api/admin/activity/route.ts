import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { ApiError, apiError, json } from "@/lib/server/http";
export async function GET(request: Request) {
  try {
    const { supabase } = await requireSession();
    const params = new URL(request.url).searchParams;
    const before = params.get("before");
    const id = params.get("id");
    if (
      (before && !z.iso.datetime({ offset: true }).safeParse(before).success) ||
      (id && !z.uuid().safeParse(id).success) ||
      Boolean(before) !== Boolean(id)
    )
      throw new ApiError(400, "Choose a valid activity page.");
    const { data, error } = await supabase.rpc("admin_activity", {
      p_before: before,
      p_before_id: id,
    });
    if (error)
      throw new ApiError(
        error.code === "42501" ? 403 : 503,
        "Admin activity is unavailable for this account.",
      );
    return json({
      activity: (data || []).slice(0, 10),
      hasMore: (data || []).length > 10,
    });
  } catch (e) {
    return apiError(e);
  }
}
