import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { premiumAdmin } from "@/lib/premium/providers";
import {
  apiError,
  ApiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
import { readDocument, uploadForm } from "@/lib/server/documents";
import { beginUpload } from "@/lib/server/uploads";
const kind = z.enum([
  "cover_letter",
  "supporting",
  "certification",
  "licence",
  "right_to_work",
]);
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  let release: (() => Promise<void>) | undefined;
  try {
    assertSameOrigin(request);
    const { user } = await requireSession();
    release = await beginUpload(user.id);
    const form = await uploadForm(request);
    const parsedKind = kind.safeParse(form.get("kind"));
    const file = form.get("file");
    if (!parsedKind.success || !(file instanceof File))
      throw new ApiError(400, "Choose a document and its purpose.");
    const parsed = await readDocument(file, false);
    if (parsedKind.data === "cover_letter" && parsed.text.length > 15000)
      throw new ApiError(
        400,
        "Use a cover letter with at most 15,000 characters.",
      );
    const admin = premiumAdmin();
    const count = await admin
      .from("application_uploads")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", user.id);
    if (count.error || count.count === null)
      throw new ApiError(503, "Uploads are temporarily unavailable.");
    if (count.count >= 16)
      throw new ApiError(
        409,
        "Remove an unused application attachment before uploading another.",
      );
    const id = crypto.randomUUID(),
      path = `${user.id}/attachments/${id}.${parsed.mediaType === "application/pdf" ? "pdf" : "docx"}`;
    const uploaded = await admin.storage
      .from("application-documents")
      .upload(path, file, { contentType: parsed.mediaType, upsert: false });
    if (uploaded.error)
      throw new ApiError(503, "Your document could not be uploaded.");
    const saved = await admin
      .from("application_uploads")
      .insert({
        id,
        user_id: user.id,
        filename: parsed.filename,
        storage_path: path,
        media_type: parsed.mediaType,
        bytes: parsed.bytes,
        kind: parsedKind.data,
        extracted_text: parsed.text,
      });
    if (saved.error) {
      await admin.storage.from("application-documents").remove([path]);
      throw new ApiError(503, "Your document could not be saved.");
    }
    return json(
      {
        id,
        filename: parsed.filename,
        kind: parsedKind.data,
        bytes: parsed.bytes,
        text: parsedKind.data === "cover_letter" ? parsed.text : undefined,
      },
      201,
    );
  } catch (e) {
    return apiError(e);
  } finally {
    await release?.().catch(() => {});
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
    const { user } = await requireSession();
    const admin = premiumAdmin();
    // Delete and submission use one locked database operation to determine ownership.
    const removed = await admin.rpc("remove_application_upload", {
      p_id: id,
      p_user: user.id,
    });
    if (removed.error)
      throw new ApiError(
        409,
        "This attachment has already been submitted or is unavailable.",
      );
    if (removed.data) {
      const r = await admin.storage
        .from("application-documents")
        .remove([removed.data]);
      if (r.error)
        throw new ApiError(
          503,
          "Removal is queued and will be retried automatically.",
        );
      await admin
        .from("document_cleanup")
        .delete()
        .eq("storage_path", removed.data);
    }
    return json({ message: "Unused attachment removed." });
  } catch (e) {
    return apiError(e);
  }
}
