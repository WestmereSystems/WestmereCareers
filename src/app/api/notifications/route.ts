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
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireSession();
    const params = new URL(request.url).searchParams;
    const rawOffset = Number(params.get("offset") || 0);
    if (
      !Number.isSafeInteger(rawOffset) ||
      rawOffset < 0 ||
      rawOffset > 100_000
    )
      throw new ApiError(400, "Choose a valid notification page.");
    const before = params.get("before"),
      beforeId = params.get("beforeId");
    let query = supabase
      .from("notifications")
      .select("id,title,message,path,read_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (before || beforeId) {
      const date = z.iso.datetime({ offset: true }).safeParse(before),
        id = z.uuid().safeParse(beforeId);
      if (!date.success || !id.success)
        throw new ApiError(400, "Choose a valid notification page.");
      const timestamp = new Date(date.data).toISOString();
      query = query.or(
        `created_at.lt.${timestamp},and(created_at.eq.${timestamp},id.lt.${id.data})`,
      );
    }
    const [{ data, error }, { count, error: countError }] = await Promise.all([
      query.range(rawOffset, rawOffset + 19),
      supabase
        .from("notifications")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", user.id)
        .is("read_at", null),
    ]);
    if (error || countError)
      throw new ApiError(
        503,
        "Your notifications are temporarily unavailable.",
      );
    return json({ notifications: data || [], unread: count || 0 });
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
