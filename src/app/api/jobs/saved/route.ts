import { getPublicJobsByIds } from "@/lib/jobs-server";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  if (raw.length > 10500)
    return json({ error: "Load up to 100 saved roles at a time." }, 400);
  const ids = [...new Set(raw.split(",").filter(Boolean))];
  if (ids.length > 100 || ids.some((id) => id.length > 100))
    return json({ error: "Load up to 100 saved roles at a time." }, 400);
  const result = await getPublicJobsByIds(ids);
  return json(result, result.error ? 503 : 200);
}
