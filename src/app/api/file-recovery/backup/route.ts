import { timingSafeEqual } from "node:crypto";
import { backupFiles } from "@/lib/server/file-recovery";
import { apiError, json, ApiError } from "@/lib/server/http";
export const runtime = "nodejs";
export const maxDuration = 300;
function matches(actual: string, secret: string | undefined) {
  if (!secret) return false;
  const a = Buffer.from(actual),
    b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function GET(request: Request) {
  try {
    const actual = request.headers.get("authorization") || "";
    if (
      !matches(actual, process.env.CRON_SECRET) &&
      !matches(actual, process.env.FILE_RECOVERY_JOB_TOKEN)
    )
      throw new ApiError(401, "Unauthorised.");
    return json(await backupFiles());
  } catch (e) {
    return apiError(e);
  }
}
