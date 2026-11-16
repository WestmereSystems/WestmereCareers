import { getSessionContext } from "@/lib/server/auth";
import { assertIndividual } from "@/lib/server/business";
import { assistantIdentity } from "@/lib/server/assistant-identity";
import { premiumAdmin } from "@/lib/premium/providers";
import { premiumError } from "@/lib/premium/http";
import { apiError, ApiError, assertSameOrigin, json } from "@/lib/server/http";
import { uploadForm, readDocument } from "@/lib/server/documents";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  let network: string | undefined, token: string | undefined;
  try {
    assertSameOrigin(request);
    const { user, business } = await getSessionContext();
    if (user) assertIndividual(business);
    network = assistantIdentity(
      undefined,
      user?.id || null,
      request,
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    ).abuse;
    const admin = premiumAdmin();
    const reserved = await admin.rpc("reserve_assistant_upload", {
      p_network: network,
    });
    if (reserved.error || typeof reserved.data !== "string")
      throw new ApiError(
        429,
        "Document uploads are temporarily limited. Try again shortly.",
      );
    token = reserved.data;
    const form = await uploadForm(request);
    const file = form.get("file");
    if (!(file instanceof File))
      throw new ApiError(400, "Choose a PDF, DOCX or text file.");
    let text: string;
    if (/\.txt$/i.test(file.name)) {
      if (file.size > 60000)
        throw new ApiError(413, "Choose a text file smaller than 60 KB.");
      text = await file.text();
    } else {
      text = (await readDocument(file)).text;
    }
    if (text.trim().length < 100)
      throw new ApiError(
        400,
        "There is not enough readable CV text. Upload a text-based PDF or DOCX, or paste your CV. Scanned PDFs need text recognition first.",
      );
    if (text.length > 24000)
      throw new ApiError(
        400,
        "Keep your CV under 24,000 characters. Paste the relevant sections instead.",
      );
    return json({
      text,
      filename: file.name
        .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
        .slice(0, 180),
      message:
        "Text extracted for this session only. Check it before consenting to an AI review. The original file is not saved.",
    });
  } catch (e) {
    if (e instanceof ApiError) return apiError(e);
    return premiumError(e);
  } finally {
    if (network && token)
      await premiumAdmin()
        .rpc("release_assistant_upload", { p_network: network, p_token: token })
        .then(
          () => {},
          () => {},
        );
  }
}
