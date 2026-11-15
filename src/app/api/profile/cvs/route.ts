import { beginUpload } from "@/lib/server/uploads";
import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { premiumAdmin } from "@/lib/premium/providers";
import {
  ApiError,
  apiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
import { readDocument, uploadForm } from "@/lib/server/documents";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireSession();
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      if (!z.uuid().safeParse(id).success)
        throw new ApiError(400, "Choose a CV.");
      const { data, error } = await supabase
        .from("candidate_cvs")
        .select("storage_path,filename,media_type")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error || !data) throw new ApiError(404, "CV not found.");
      const file = await premiumAdmin()
        .storage.from("candidate-documents")
        .download(data.storage_path);
      if (file.error || !file.data)
        throw new ApiError(503, "Your download is temporarily unavailable.");
      return new Response(file.data, {
        headers: {
          "Content-Type": data.media_type,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(data.filename)}`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox",
        },
      });
    }
    const { data, error } = await supabase
      .from("candidate_cvs")
      .select("id,filename,media_type,bytes,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error)
      throw new ApiError(503, "Your CV history is temporarily unavailable.");
    const selected = await supabase
      .from("profiles")
      .select("active_cv_id")
      .eq("id", user.id)
      .maybeSingle();
    return json({ cvs: data, activeId: selected.data?.active_cv_id || null });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  let release: (() => Promise<void>) | undefined;
  try {
    assertSameOrigin(request);
    const { user } = await requireSession();
    release = await beginUpload(user.id);
    const form = await uploadForm(request);
    const file = form.get("file");
    if (!(file instanceof File))
      throw new ApiError(400, "Choose a PDF or Word document.");
    const parsed = await readDocument(file);
    const admin = premiumAdmin();
    const id = crypto.randomUUID(),
      path = `${user.id}/${id}.${parsed.mediaType === "application/pdf" ? "pdf" : "docx"}`;
    const { count } = await admin
      .from("candidate_cvs")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", user.id);
    if (count === null)
      throw new ApiError(503, "CV storage is temporarily unavailable.");
    if (count >= 20)
      throw new ApiError(
        409,
        "Your history holds 20 CVs. Delete an older version before uploading another.",
      );
    const uploaded = await admin.storage
      .from("candidate-documents")
      .upload(path, file, { contentType: parsed.mediaType, upsert: false });
    if (uploaded.error)
      throw new ApiError(503, "Your CV could not be uploaded.");
    const { error } = await admin.from("candidate_cvs").insert({
      id,
      user_id: user.id,
      filename: parsed.filename,
      storage_path: path,
      media_type: parsed.mediaType,
      bytes: parsed.bytes,
      extracted_text: parsed.text,
    });
    if (error) {
      await admin.storage.from("candidate-documents").remove([path]);
      throw new ApiError(503, "Your CV could not be saved.");
    }
    return json(
      {
        id,
        text: parsed.text,
        message:
          "CV uploaded privately. Review its extracted text, then choose it as your base CV.",
      },
      201,
    );
  } catch (e) {
    return apiError(e);
  } finally {
    await release?.().catch(() => {});
  }
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const { id } = await parseBody(
      request,
      z.object({ id: z.uuid() }).strict(),
      1000,
    );
    const { supabase, user } = await requireSession();
    const { data, error } = await supabase
      .from("candidate_cvs")
      .select("extracted_text")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !data) throw new ApiError(404, "CV not found.");
    const saved = await supabase.from("profiles").upsert({
      id: user.id,
      cv_text: data.extracted_text,
      active_cv_id: id,
      updated_at: new Date().toISOString(),
    });
    if (saved.error)
      throw new ApiError(503, "Your base CV could not be changed.");
    return json({
      text: data.extracted_text,
      message:
        "Base CV selected. Existing applications keep their original submission.",
    });
  } catch (e) {
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
    const { supabase, user } = await requireSession();
    const { data } = await supabase
      .from("candidate_cvs")
      .select("storage_path")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!data) throw new ApiError(404, "CV not found.");
    const admin = premiumAdmin();
    const removed = await admin.storage
      .from("candidate-documents")
      .remove([data.storage_path]);
    if (removed.error)
      throw new ApiError(
        503,
        "Your file could not be removed. Please try again.",
      );
    const deleted = await admin
      .from("candidate_cvs")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (deleted.error)
      throw new ApiError(
        503,
        "Your history could not be updated. Please retry.",
      );
    return json({
      message:
        "CV file and history entry deleted. Any base CV text and submitted applications are separate; clear the profile text if you no longer need it.",
    });
  } catch (e) {
    return apiError(e);
  }
}
