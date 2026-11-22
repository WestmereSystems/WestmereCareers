import { assertBusinessTerms } from "@/lib/server/business";
import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import {
  apiError,
  ApiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
import { checkRpc } from "@/lib/server/trust";
const input = z
  .object({
    kind: z.enum(["employer", "agency"]).optional(),
    specialisms: z.array(z.string().trim().min(2).max(100)).max(20).default([]),
    regions: z.array(z.string().trim().min(2).max(100)).max(20).default([]),
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
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireSession();
    const params = new URL(request.url).searchParams;
    const pageInput = z.coerce.number().int().min(1).max(10000);
    const paging = z
      .object({ page: pageInput, businessPage: pageInput })
      .safeParse({
        page: params.get("page") || 1,
        businessPage: params.get("businessPage") || 1,
      });
    if (!paging.success)
      throw new ApiError(400, "Choose an available verification page.");
    const { page, businessPage } = paging.data;
    const [requests, businesses, capacity] = await Promise.all([
      supabase
        .from("employer_verification_requests")
        .select("*", { count: "exact" })
        .eq("applicant_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range((page - 1) * 5, page * 5 - 1),
      supabase
        .from("organisation_members")
        .select(
          "role,organisations!inner(id,name,is_verified,suspended_at,created_at)",
          { count: "exact" },
        )
        .eq("user_id", user.id)
        .eq("organisations.is_verified", true)
        .order("organisation_id", { ascending: true })
        .range((businessPage - 1) * 5, businessPage * 5 - 1),
      supabase.rpc("my_business_registration_capacity"),
    ]);
    checkRpc(requests.error);
    checkRpc(businesses.error);
    checkRpc(capacity.error);
    return json({
      requests: requests.data,
      total: requests.count || 0,
      page,
      verifiedBusinesses: businesses.data,
      businessTotal: businesses.count || 0,
      businessPage,
      capacity: capacity.data,
    });
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
    const { data, error } = await supabase.rpc(
      "submit_typed_business_verification",
      {
        p_details: {
          ...body,
          kind: body.kind || business?.kind || "employer",
          requestId: body.requestId ?? null,
        },
      },
    );
    if (error?.code === "23514")
      throw new ApiError(
        409,
        "Your business allowance is full. Existing businesses and pending reviews count towards your subscription limit. Review your plan before submitting another business.",
      );
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

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(
      request,
      z
        .object({
          id: z.uuid(),
          version: z.iso.datetime({ offset: true }),
          reason: z.string().trim().max(1000).default(""),
          confirmation: z.literal(true),
        })
        .strict(),
      2000,
    );
    const { supabase } = await requireSession();
    const result = await supabase.rpc("withdraw_business_verification", {
      p_id: body.id,
      p_version: body.version,
      p_reason: body.reason,
    });
    checkRpc(result.error);
    return json({
      message:
        "Verification application withdrawn. It is no longer awaiting review and its business slot is available again. Your account remains open.",
    });
  } catch (error) {
    return apiError(error);
  }
}
