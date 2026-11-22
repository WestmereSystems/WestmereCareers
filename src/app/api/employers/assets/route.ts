import { requireSession } from "@/lib/server/auth";
import { beginUpload } from "@/lib/server/uploads";
import { z } from "zod";
import sharp from "sharp";
import { requireEmployer } from "@/lib/server/employers";
import { premiumAdmin } from "@/lib/premium/providers";
import { readDocument, uploadForm } from "@/lib/server/documents";
import { ApiError, apiError, assertSameOrigin, json } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  let release: (() => Promise<void>) | undefined;
  try {
    assertSameOrigin(request);
    const context = await requireSession();
    release = await beginUpload(context.user.id);
    const form = await uploadForm(request);
    const organisationId = z.uuid().parse(form.get("organisationId")),
      kind = z.enum(["avatar", "banner", "document"]).parse(form.get("kind"));
    const { supabase, user } = await requireEmployer(
      organisationId,
      kind !== "document",
      kind === "document" ? z.uuid().parse(form.get("jobId")) : undefined,
      "listing",
    );
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size > 4 * 1024 * 1024 ||
      file.size === 0
    )
      throw new ApiError(400, "Choose a file smaller than 4 MB.");
    const admin = premiumAdmin(),
      id = crypto.randomUUID();
    if (kind === "document") {
      const jobId = z.uuid().parse(form.get("jobId"));
      const { data: job } = await supabase
        .from("jobs")
        .select("id")
        .eq("id", jobId)
        .eq("organisation_id", organisationId)
        .maybeSingle();
      if (!job) throw new ApiError(404, "Listing not found.");
      const { count, error: countError } = await admin
        .from("listing_documents")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId);
      if (countError || count === null)
        throw new ApiError(503, "Listing documents are unavailable.");
      if (count >= 5)
        throw new ApiError(409, "Each listing supports up to five documents.");
      const parsed = await readDocument(file, false),
        path = `${organisationId}/listings/${jobId}/${id}.${parsed.mediaType === "application/pdf" ? "pdf" : "docx"}`;
      const upload = await admin.storage
        .from("employer-assets")
        .upload(path, file, { contentType: parsed.mediaType });
      if (upload.error)
        throw new ApiError(503, "This document could not be uploaded.");
      const saved = await admin.from("listing_documents").insert({
        id,
        job_id: jobId,
        uploaded_by: user.id,
        filename: parsed.filename,
        storage_path: path,
        media_type: parsed.mediaType,
        bytes: parsed.bytes,
      });
      if (saved.error) {
        await admin.storage.from("employer-assets").remove([path]);
        throw new ApiError(503, "This document could not be saved.");
      }
      const review = await admin
        .from("jobs")
        .update({
          status: "draft",
          moderation_status: "pending",
          publication_requested: true,
          moderation_updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      if (review.error)
        throw new ApiError(
          503,
          "The document was saved; publication review needs attention.",
        );
      return json(
        {
          message:
            "Document uploaded. The listing is awaiting review before publication.",
        },
        201,
      );
    }
    let image: Buffer;
    try {
      const input = sharp(Buffer.from(await file.arrayBuffer()), {
        limitInputPixels: 24_000_000,
        animated: false,
      });
      const meta = await input.metadata();
      if (!["jpeg", "png", "webp"].includes(meta.format || ""))
        throw new Error();
      image = await input
        .rotate()
        .resize(kind === "avatar" ? 400 : 1800, kind === "avatar" ? 400 : 600, {
          fit: "cover",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new ApiError(
        400,
        "Choose a standard JPEG, PNG or WebP image up to 24 megapixels.",
      );
    }
    const field = kind === "avatar" ? "avatar_path" : "banner_path",
      existing = await admin
        .from("organisations")
        .select(field)
        .eq("id", organisationId)
        .single(),
      path = `${organisationId}/${kind}/${id}.webp`;
    const upload = await admin.storage
      .from("employer-assets")
      .upload(path, image, { contentType: "image/webp" });
    if (upload.error)
      throw new ApiError(503, "Your image could not be uploaded.");
    const saved = await admin
      .from("organisations")
      .update({ [field]: path })
      .eq("id", organisationId);
    if (saved.error) {
      await admin.storage.from("employer-assets").remove([path]);
      throw new ApiError(503, "Your image could not be saved.");
    }
    const old = existing.data?.[field as keyof typeof existing.data];
    if (typeof old === "string")
      await admin.storage.from("employer-assets").remove([old]);
    return json(
      {
        message:
          "Employer image saved. Metadata was removed and the image was optimised.",
      },
      201,
    );
  } catch (e) {
    if (e instanceof z.ZodError)
      return json({ error: "Check the employer and file selection." }, 400);
    return apiError(e);
  } finally {
    await release?.().catch(() => {});
  }
}
