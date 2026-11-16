import { assertBusinessTerms } from "@/lib/server/business";
import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { apiError, assertSameOrigin, json, parseBody } from "@/lib/server/http";
import { checkRpc } from "@/lib/server/trust";
const input = z
  .object({
    requestId: z.uuid().nullable().optional(),
    businessName: z.string().trim().min(2).max(180),
    abn: z.string().regex(/^\d{11}$/),
    website: z
      .url()
      .max(500)
      .refine((v) => new URL(v).protocol === "https:"),
    contactRole: z.string().trim().min(2).max(120),
    evidence: z.string().trim().min(30).max(4000),
    linkedin: z
      .url()
      .max(500)
      .refine((v) => {
        const u = new URL(v);
        return (
          u.protocol === "https:" &&
          (u.hostname === "linkedin.com" ||
            u.hostname.endsWith(".linkedin.com"))
        );
      }),
    hrEmail: z.email().max(254),
    hrPhone: z
      .string()
      .trim()
      .regex(/^[+0-9() .-]{6,40}$/),
    contactSource: z
      .url()
      .max(500)
      .refine((v) => new URL(v).protocol === "https:"),
    contactPermission: z.literal(true),
  })
  .strict();
export async function GET() {
  try {
    const { supabase, user } = await requireSession();
    const { data, error } = await supabase
      .from("employer_verification_requests")
      .select("*")
      .eq("applicant_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    checkRpc(error);
    return json({ requests: data });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(request, input, 8000);
    const { supabase, business } = await requireSession();
    assertBusinessTerms(business);
    const { data, error } = await supabase.rpc("submit_business_verification", {
      p_request_id: body.requestId ?? null,
      p_name: body.businessName,
      p_abn: body.abn,
      p_website: body.website,
      p_contact_role: body.contactRole,
      p_evidence: body.evidence,
      p_linkedin: body.linkedin,
      p_hr_email: body.hrEmail,
      p_hr_phone: body.hrPhone,
      p_contact_source: body.contactSource,
      p_contact_permission: body.contactPermission,
    });
    checkRpc(error);
    return json(
      {
        id: data,
        message:
          "Your business is awaiting independent review. We aim to review complete submissions within 48 hours. Follow progress and requests for information here.",
      },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
