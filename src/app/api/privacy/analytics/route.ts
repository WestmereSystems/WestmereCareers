import { cookies } from "next/headers";
import { z } from "zod";
import { apiError, assertSameOrigin, json, parseBody } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  const value = (await cookies()).get("westmere-analytics")?.value;
  return json({
    choice: value === "allow" || value === "decline" ? value : null,
  });
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { choice } = await parseBody(
      request,
      z.object({ choice: z.enum(["allow", "decline"]) }).strict(),
      1000,
    );
    (await cookies()).set("westmere-analytics", choice, {
      httpOnly: true,
      secure: new URL(request.url).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 31536000,
    });
    return json({ choice });
  } catch (e) {
    return apiError(e);
  }
}
