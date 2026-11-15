import { checkRpc } from "@/lib/server/trust";
import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { premiumAdmin } from "@/lib/premium/providers";
import {
  ApiError,
  apiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
export const dynamic = "force-dynamic";
async function access() {
  const c = await requireSession();
  const { data, error } = await c.supabase.rpc("my_sample_workspace");
  if (error || data !== true)
    throw new ApiError(
      403,
      "This sample workspace is available only to its invited, verified account.",
    );
  return c;
}
export async function GET() {
  try {
    const { supabase, user } = await access();
    const { data, error } = await supabase
      .from("sample_jobs")
      .select(
        "id,title,description,status,created_at,sample_applications(id,candidate_name,status,created_at)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error)
      throw new ApiError(503, "The sample workspace could not be loaded.");
    return json({ jobs: data });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(
      request,
      z
        .object({
          title: z.string().trim().min(3).max(180),
          description: z.string().trim().min(20).max(20000),
        })
        .strict(),
    );
    const { supabase, user } = await access();
    const { data, error } = await supabase
      .from("sample_jobs")
      .insert({ ...body, user_id: user.id })
      .select("id")
      .single();
    if (error)
      throw new ApiError(503, "Your sample role could not be created.");
    return json(
      {
        id: data.id,
        message:
          "Sample draft saved. It is private and cannot appear in public job searches.",
      },
      201,
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(
      request,
      z.discriminatedUnion("action", [
        z
          .object({
            action: z.literal("status"),
            id: z.uuid(),
            status: z.enum(["draft", "open", "closed"]),
          })
          .strict(),
        z.object({ action: z.literal("simulate"), id: z.uuid() }).strict(),
        z
          .object({
            action: z.literal("notify"),
            id: z.uuid(),
            email: z.boolean(),
          })
          .strict(),
        z
          .object({
            action: z.literal("stage"),
            id: z.uuid(),
            status: z.enum([
              "received",
              "opened",
              "shortlisted",
              "interview",
              "offer",
              "not_proceeding",
            ]),
          })
          .strict(),
      ]),
      2000,
    );
    const { supabase, user } = await access();
    if (body.action === "notify") {
      const { error } = await supabase.rpc("request_sample_notification", {
        p_application: body.id,
        p_email: body.email,
      });
      checkRpc(error);
      return json({
        message: body.email
          ? "One sample email has been queued to your own verified account. A matching site notification is ready; delivery may take a few minutes."
          : "A sample notification is ready in your site inbox. No email was requested.",
      });
    }
    if (body.action === "stage") {
      const r = await supabase
        .from("sample_applications")
        .update({ status: body.status })
        .eq("id", body.id)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();
      if (r.error || !r.data)
        throw new ApiError(404, "Sample application not found.");
    } else {
      const job = await supabase
        .from("sample_jobs")
        .select("id,title,status")
        .eq("id", body.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (job.error || !job.data)
        throw new ApiError(404, "Sample role not found.");
      if (body.action === "simulate") {
        if (job.data.status !== "open")
          throw new ApiError(
            409,
            "Open the sample role before adding a synthetic application.",
          );
        const r = await premiumAdmin()
          .from("sample_applications")
          .insert({ job_id: body.id, user_id: user.id });
        if (r.error)
          throw new ApiError(503, "The sample application could not be added.");
      } else {
        const r = await supabase
          .from("sample_jobs")
          .update({ status: body.status, updated_at: new Date().toISOString() })
          .eq("id", body.id)
          .eq("user_id", user.id);
        if (r.error)
          throw new ApiError(503, "This sample role could not be updated.");
      }
    }
    return json({
      message: "Sample workspace updated. No real applicant was contacted.",
    });
  } catch (e) {
    return apiError(e);
  }
}
