import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { premiumAdmin } from "@/lib/premium/providers";
import { ApiError, apiError } from "@/lib/server/http";
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!z.uuid().safeParse(id).success)
      throw new ApiError(400, "Choose an application document.");
    const { supabase } = await requireSession();
    const admin = premiumAdmin();
    const { data: doc, error } = await admin
      .from("application_documents")
      .select("application_id,filename,storage_path,media_type")
      .eq("id", id)
      .maybeSingle();
    if (error || !doc) throw new ApiError(404, "Document not found.");
    // Recheck current membership, verification and withdrawal on every download.
    const opened = await supabase.rpc("open_application", {
      p_application_id: doc.application_id,
    });
    if (opened.error)
      throw new ApiError(403, "You no longer have access to this application.");
    const file = await admin.storage
      .from("application-documents")
      .download(doc.storage_path);
    if (file.error || !file.data)
      throw new ApiError(503, "Document download is temporarily unavailable.");
    return new Response(file.data, {
      headers: {
        "Content-Type": doc.media_type,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
