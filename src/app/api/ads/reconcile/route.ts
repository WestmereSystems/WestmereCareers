import { json } from "@/lib/server/http";
import { cronAuthorized } from "@/lib/premium/cron";
import { runMeasurementWorker } from "@/lib/ads/worker";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: Request) {
  if (
    !cronAuthorized(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  )
    return json(
      { error: "A valid scheduled-service credential is required." },
      401,
    );
  try {
    return json(await runMeasurementWorker());
  } catch {
    return json(
      {
        error: "Advertising measurement needs review.",
        code: "MEASUREMENT_RECONCILIATION_FAILED",
      },
      503,
    );
  }
}
