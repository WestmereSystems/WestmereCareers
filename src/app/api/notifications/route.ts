import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import {
  ApiError,
  apiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { supabase, user } = await requireSession();
    const { data, error } = await supabase
      .from("notifications")
      .select("id,title,message,path,read_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error)
      throw new ApiError(
        503,
        "Your notifications are temporarily unavailable.",
      );
    return json({ notifications: data });
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const { id } = await parseBody(
      request,
      z.object({ id: z.uuid().optional() }).strict(),
      1000,
    );
    const { supabase, user } = await requireSession();
    let query = supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (id) query = query.eq("id", id);
    const { error } = await query;
    if (error)
      throw new ApiError(503, "Your notification could not be updated.");
    return json({ message: "Marked as read." });
  } catch (e) {
    return apiError(e);
  }
}
