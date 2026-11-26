import { z } from "zod";
import { browserAdsState } from "@/lib/ads/context";
import { apiError, assertSameOrigin, json, parseBody } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return json(await browserAdsState(request));
  } catch {
    return json({
      enabled: false,
      delivery: false,
      consent: null,
      registration: null,
    });
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(
      request,
      z
        .object({
          measurement: z.boolean().optional(),
          adUserData: z.boolean().optional(),
          enhanced: z.boolean().optional(),
          identifiers: z
            .object({
              gclid: z.string().max(512).optional(),
              gbraid: z.string().max(512).optional(),
              wbraid: z.string().max(512).optional(),
            })
            .strict()
            .optional(),
          gpc: z.boolean().optional(),
        })
        .strict(),
      2500,
    );
    return json(await browserAdsState(request, body));
  } catch (error) {
    if (
      error instanceof Error &&
      /^(MEASUREMENT_|NOT_CONFIGURED)/.test(error.message)
    )
      return json(
        {
          error:
            "Your advertising choice could not be saved. Please try again.",
        },
        503,
      );
    return apiError(error);
  }
}
