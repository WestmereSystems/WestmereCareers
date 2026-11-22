import { assertCareerTools } from "@/lib/server/business";
import { PremiumError, premiumError } from "@/lib/premium/http";
import { requireSession } from "@/lib/server/auth";
import {
  apiError,
  ApiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
import { saveChatSchema } from "@/lib/assistant-chats";

export async function GET() {
  try {
    const { supabase, user } = await requireSession();
    const { data, error } = await supabase
      .from("assistant_chats")
      .select("id,title,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(10);
    if (error)
      throw new ApiError(503, "Your chats could not be loaded. Try again.");
    return json({ chats: data });
  } catch (error) {
    return error instanceof PremiumError
      ? premiumError(error)
      : apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase, user, business, isPremium } = await requireSession();
    assertCareerTools(business, isPremium);
    if (!isPremium)
      throw new ApiError(403, "Careers+ is required to save conversations.");
    const body = await parseBody(request, saveChatSchema, 4_000_000);
    const existing = await supabase
      .from("assistant_chats")
      .select("id")
      .eq("user_id", user.id)
      .eq("id", body.id)
      .maybeSingle();
    if (existing.error)
      throw new ApiError(503, "This chat could not be saved. Try again.");
    const updateOwned = () =>
      supabase
        .from("assistant_chats")
        .update({ title: body.title, snapshot: body.snapshot })
        .eq("user_id", user.id)
        .eq("id", body.id)
        .select("id,title,updated_at")
        .single();
    let { data, error } = existing.data
      ? await updateOwned()
      : await supabase
          .from("assistant_chats")
          .insert({ ...body, user_id: user.id })
          .select("id,title,updated_at")
          .single();
    // A lost response can leave a successful insert behind. Retry the same ID
    // against the verified owner instead of creating another conversation.
    if (error?.code === "23505") {
      ({ data, error } = await updateOwned());
    }
    if (error?.code === "P0001")
      throw new ApiError(
        409,
        "You can save up to 10 chats. Delete a chat to start another.",
        "CHAT_LIMIT",
      );
    if (error)
      throw new ApiError(503, "This chat could not be saved. Try again.");
    return json({ chat: data }, 201);
  } catch (error) {
    return error instanceof PremiumError
      ? premiumError(error)
      : apiError(error);
  }
}
