import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { premiumAdmin } from "@/lib/premium/providers";
import { json } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = z.uuid().safeParse(url.searchParams.get("id")),
      kind = z
        .enum(["avatar", "banner"])
        .safeParse(url.searchParams.get("kind"));
    if (!id.success || !kind.success)
      return json({ error: "Image not found." }, 404);
    const db = await createClient();
    if (!db) return json({ error: "Image not found." }, 404);
    const field = kind.data === "avatar" ? "avatar_path" : "banner_path";
    const { data } = await db
      .from("organisations")
      .select(`${field},is_verified,suspended_at`)
      .eq("id", id.data)
      .eq("is_verified", true)
      .is("suspended_at", null)
      .maybeSingle();
    const path = data?.[field as keyof typeof data];
    if (typeof path !== "string")
      return json({ error: "Image not found." }, 404);
    const file = await premiumAdmin()
      .storage.from("employer-assets")
      .download(path);
    if (file.error || !file.data)
      return json({ error: "Image unavailable." }, 404);
    return new Response(file.data, {
      headers: {
        "Content-Type": "image/webp",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return json({ error: "Image unavailable." }, 404);
  }
}
