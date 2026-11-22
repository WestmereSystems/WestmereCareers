import { z } from "zod";
import { premiumAdmin } from "@/lib/premium/providers";
import { launchNetworkKey } from "@/lib/server/launch";
import {
  ApiError,
  apiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
import { checkRpc } from "@/lib/server/trust";
const input = z
  .object({
    email: z.email().max(254),
    kind: z.enum(["employer", "agency", "candidate"]),
    name: z.string().trim().max(120).default(""),
    business: z.string().trim().max(180).default(""),
    vacancyUrl: z
      .union([
        z.literal(""),
        z
          .url()
          .max(500)
          .refine((v) => /^https?:\/\//i.test(v), "Use an http or https link."),
      ])
      .default(""),
    consent: z.literal(true),
    website: z.string().max(200).default(""),
  })
  .strict();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const b = await parseBody(request, input, 2500);
    if (b.kind !== "candidate")
      return json(
        {
          error:
            "Business registration is open. Register directly to prepare for launch.",
          registerUrl: `/launch/register${b.kind === "agency" ? "?kind=agency" : ""}`,
        },
        409,
      );
    if (!b.website) {
      const { error } = await premiumAdmin().rpc("submit_launch_request", {
        p_email: b.email.toLowerCase(),
        p_kind: b.kind,
        p_name: b.name,
        p_business: b.business,
        p_url: b.vacancyUrl,
        p_network: launchNetworkKey(request),
      });
      checkRpc(
        error,
        "Your request could not be saved. Please try again or email hello@westmere.com.au.",
      );
    }
    return json({
      message:
        "Your launch-update request is saved. You’ll receive launch updates at this email address. No account or subscription has been started.",
    });
  } catch (e) {
    return apiError(e);
  }
}
