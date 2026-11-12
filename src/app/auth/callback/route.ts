import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applicationOrigin, safeReturnPath } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = applicationOrigin(request);
  const code = url.searchParams.get("code");
  const supabase = await createClient();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(safeReturnPath(url.searchParams.get("next")), origin),
        { headers: { "Cache-Control": "private, no-store" } },
      );
  }
  return NextResponse.redirect(new URL("/?auth=expired", origin), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
