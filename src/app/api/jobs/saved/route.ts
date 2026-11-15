import { z } from "zod";
import { getPublicJobsByIds } from "@/lib/jobs-server";
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
    const { data, error } = await supabase
      .from("saved_jobs")
      .select("job_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error)
      throw new ApiError(503, "Your saved roles are temporarily unavailable.");
    const ids = (data || []).map((x) => x.job_id);
    if (new URL(request.url).searchParams.get("idsOnly") === "1")
      return json({ ids });
    const result = await getPublicJobsByIds(ids);
    return json({ ...result, ids }, result.error ? 503 : 200);
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { id, saved } = await parseBody(
      request,
      z.object({ id: z.uuid(), saved: z.boolean() }).strict(),
      1000,
    );
    const { supabase, user } = await requireSession();
    const result = saved
      ? await supabase
          .from("saved_jobs")
          .upsert(
            { user_id: user.id, job_id: id },
            { onConflict: "user_id,job_id", ignoreDuplicates: true },
          )
      : await supabase
          .from("saved_jobs")
          .delete()
          .eq("user_id", user.id)
          .eq("job_id", id);
    if (result.error)
      throw new ApiError(
        400,
        "This role could not be saved. It may have closed, or your saved list may be full.",
      );
    return json({ saved });
  } catch (e) {
    return apiError(e);
  }
}
