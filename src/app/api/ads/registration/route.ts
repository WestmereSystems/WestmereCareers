import { z } from "zod";
import { browserAdsState } from "@/lib/ads/context";
import { premiumAdmin } from "@/lib/premium/providers";
import { apiError, assertSameOrigin, json, parseBody } from "@/lib/server/http";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { eventId } = await parseBody(
      request,
      z.object({ eventId: z.uuid() }).strict(),
      200,
    );
    const state = await browserAdsState(request);
    if (!state.delivery || state.registration?.id !== eventId)
      return json({ recorded: false }, 403);
    const db = premiumAdmin();
    const result = await db
      .from("ads_conversion_events")
      .update({
        status: "tag_queued",
        updated_at: new Date().toISOString(),
        destination: state.registration.sendTo,
      })
      .eq("id", eventId)
      .eq("status", "queued");
    if (result.error) throw new Error("MEASUREMENT_ACK_FAILED");
    // This is a browser callback, not an acknowledgement from Google Ads.
    await db
      .from("ads_delivery_attempts")
      .insert({
        event_id: eventId,
        state: "tag_queued",
        code: "BROWSER_CALLBACK_ONLY",
      });
    return json({ recorded: true, acceptedByGoogle: false });
  } catch (error) {
    return apiError(error);
  }
}
