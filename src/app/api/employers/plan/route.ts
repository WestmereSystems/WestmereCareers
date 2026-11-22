import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import {
  apiError,
  ApiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";

export async function GET() {
  try {
    const { supabase } = await requireSession();
    const [plan, capacity] = await Promise.all([
      supabase.rpc("my_business_plan"),
      supabase.rpc("my_business_registration_capacity"),
    ]);
    if (plan.error || capacity.error)
      throw new ApiError(503, "Business billing coverage could not be loaded.");
    return json({ plan: plan.data, registrationCapacity: capacity.data });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { organisationIds } = await parseBody(
      request,
      z.object({ organisationIds: z.array(z.uuid()).max(10) }).strict(),
      1500,
    );
    const { supabase } = await requireSession();
    const { data, error } = await supabase.rpc(
      "set_business_plan_organisations",
      {
        p_organisations: organisationIds,
      },
    );
    if (error)
      throw new ApiError(
        error.code === "42501" ? 403 : error.code === "23514" ? 409 : 503,
        error.code === "42501"
          ? "Only businesses you own can be linked to your billing plan."
          : error.code === "23514"
            ? "Your selection exceeds this plan’s business limit. Remove a business from coverage or review your plan."
            : "Business coverage could not be saved. Please try again.",
      );
    return json({ plan: data, message: "Business billing coverage updated." });
  } catch (error) {
    return apiError(error);
  }
}
