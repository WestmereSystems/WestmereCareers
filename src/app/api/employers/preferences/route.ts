import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { businessFor } from "@/lib/server/business";
import {
  apiError,
  ApiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
export const dynamic = "force-dynamic";
const preferences = z
  .object({
    submissions: z.boolean(),
    milestones: z.boolean(),
    closing_reminders: z.boolean(),
    follow_up_reminders: z.boolean(),
    follow_up_days: z.number().int().min(1).max(60),
    email_enabled: z.boolean(),
  })
  .strict();
export async function GET() {
  try {
    const { supabase, user } = await requireSession();
    if (!(await businessFor(supabase, user.id)))
      throw new ApiError(403, "A business account is required.");
    const { data, error } = await supabase
      .from("employer_notification_preferences")
      .select(
        "submissions,milestones,closing_reminders,follow_up_reminders,follow_up_days,email_enabled",
      )
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new ApiError(503, "Preferences could not be loaded.");
    return json({ preferences: data });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(request, preferences, 1500);
    const { supabase, user } = await requireSession();
    if (!(await businessFor(supabase, user.id)))
      throw new ApiError(403, "A business account is required.");
    const { error } = await supabase
      .from("employer_notification_preferences")
      .upsert({
        ...body,
        user_id: user.id,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new ApiError(503, "Preferences could not be saved.");
    return json({ message: "Hiring notification preferences saved." });
  } catch (e) {
    return apiError(e);
  }
}
