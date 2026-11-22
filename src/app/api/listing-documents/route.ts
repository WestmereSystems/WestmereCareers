import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/server/auth";
import { requireEmployer } from "@/lib/server/employers";
import { premiumAdmin } from "@/lib/premium/providers";
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
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const db = await createClient();
    if (!db) throw new ApiError(404, "Document not found.");
    let visible = (
      await db.from("listing_documents").select("id").eq("id", id).maybeSingle()
    ).data?.id;
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!visible && user) {
      const role = await db.rpc("my_staff_role");
      if (!role.error && ["reviewer", "admin"].includes(role.data))
        visible = id;
    }
    if (!visible) throw new ApiError(404, "Document not found.");
    const admin = premiumAdmin();
    const { data } = await admin
      .from("listing_documents")
      .select("storage_path,filename,media_type")
      .eq("id", id)
      .maybeSingle();
    if (!data) throw new ApiError(404, "Document not found.");
    const file = await admin.storage
      .from("employer-assets")
      .download(data.storage_path);
    if (file.error || !file.data)
      throw new ApiError(503, "This document is temporarily unavailable.");
    return new Response(file.data, {
      headers: {
        "Content-Type": data.media_type,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(data.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError)
      return json({ error: "Document not found." }, 404);
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const { id } = await parseBody(
      request,
      z.object({ id: z.uuid() }).strict(),
      1000,
    );
    await requireSession();
    const admin = premiumAdmin();
    const { data } = await admin
      .from("listing_documents")
      .select("job_id,storage_path,jobs(organisation_id)")
      .eq("id", id)
      .maybeSingle();
    const job = (Array.isArray(data?.jobs) ? data.jobs[0] : data?.jobs) as
      { organisation_id: string } | undefined;
    if (!data || !job) throw new ApiError(404, "Document not found.");
    await requireEmployer(job.organisation_id, false, data.job_id, "listing");
    const removed = await admin.storage
      .from("employer-assets")
      .remove([data.storage_path]);
    if (removed.error)
      throw new ApiError(503, "The document could not be deleted.");
    const deleted = await admin.from("listing_documents").delete().eq("id", id);
    if (deleted.error)
      throw new ApiError(503, "The document history could not be changed.");
    return json({
      message:
        "Listing document removed. The listing requires review before publication.",
    });
  } catch (e) {
    return apiError(e);
  }
}
