import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { sandboxOwnerId } from "@/lib/premium/billing-mode";
import {
  ApiError,
  apiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
import {
  backupFiles,
  recoveryStatus,
  recoveryFiles,
  restoreMissingFile,
  manifestName,
} from "@/lib/server/file-recovery";
export const runtime = "nodejs";
export const maxDuration = 300;
async function administrator() {
  const session = await requireSession(),
    role = await session.supabase.rpc("my_staff_role");
  if (role.error)
    throw new ApiError(503, "Administrator access could not be checked.");
  if (session.user.id !== sandboxOwnerId || role.data !== "admin")
    throw new ApiError(403, "Protected administrator access is required.");
  return session.user;
}
export async function GET(request: Request) {
  try {
    await administrator();
    const snapshot = new URL(request.url).searchParams.get("snapshot");
    if (snapshot) {
      if (!manifestName.safeParse(snapshot).success)
        throw new ApiError(400, "Invalid recovery snapshot.");
      return json(await recoveryFiles(snapshot));
    }
    return json(await recoveryStatus());
  } catch (e) {
    return apiError(e);
  }
}
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("backup") }).strict(),
  z
    .object({
      action: z.literal("restore"),
      snapshot: manifestName,
      fileId: z.uuid(),
      reason: z.string().trim().min(10).max(1000),
      confirmation: z.literal("RESTORE MISSING FILE"),
    })
    .strict(),
]);
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await administrator(),
      body = await parseBody(request, input, 4000);
    return json(
      body.action === "backup"
        ? await backupFiles(user.id)
        : await restoreMissingFile(
            body.snapshot,
            body.fileId,
            body.reason,
            user.id,
          ),
    );
  } catch (e) {
    return apiError(e);
  }
}
