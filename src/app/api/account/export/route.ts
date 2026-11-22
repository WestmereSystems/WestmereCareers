import { z } from "zod";
import { requirePrivacyAccount } from "@/lib/server/account-privacy";
import { accountArchive } from "@/lib/server/account-export";
import { apiError, assertSameOrigin, parseBody } from "@/lib/server/http";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await parseBody(
      request,
      z.object({ confirmation: z.literal(true) }).strict(),
      100,
    );
    const { user } = await requirePrivacyAccount();
    const zip = await accountArchive(user);
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= zip.length) {
          controller.close();
          return;
        }
        controller.enqueue(zip.subarray(offset, offset + 65536));
        offset += 65536;
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="westmere-account-${new Date().toISOString().slice(0, 10)}.zip"`,
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
