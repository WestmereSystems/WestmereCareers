import { NextResponse } from "next/server";
import { getPublicJobs, parseJobQuery } from "@/lib/jobs-server";

export const dynamic = "force-dynamic";

/** Public inventory only. CV text never belongs in a URL, query parameter or access log. */
export async function GET(request: Request) {
  const result = await getPublicJobs(
    parseJobQuery(new URL(request.url).searchParams),
  );
  return NextResponse.json(result, {
    status: result.error ? 503 : 200,
    headers: { "Cache-Control": "private, no-store" },
  });
}
