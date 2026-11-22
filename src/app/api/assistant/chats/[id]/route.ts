import { assertCareerTools } from "@/lib/server/business";
import { PremiumError, premiumError } from "@/lib/premium/http";
import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import {
  apiError,
  ApiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
import { saveChatSchema } from "@/lib/assistant-chats";

type Context = { params: Promise<{ id: string }> };
async function ownedChat(context: Context) {
  const session = await requireSession();
  const id = z.uuid().safeParse((await context.params).id);
  if (!id.success) throw new ApiError(400, "Choose a saved chat.");
  return { ...session, id: id.data };
}
export async function GET(_request: Request, context: Context) {
  try {
    const { supabase, user, id } = await ownedChat(context);
    const { data, error } = await supabase
      .from("assistant_chats")
      .select("id,title,updated_at,snapshot")
      .eq("user_id", user.id)
      .eq("id", id)
      .maybeSingle();
    if (error)
      throw new ApiError(503, "This conversation could not be loaded.");
    if (!data) throw new ApiError(404, "This chat is no longer available.");
    return json({ chat: data });
  } catch (error) {
    return error instanceof PremiumError
      ? premiumError(error)
      : apiError(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { supabase, user, id, isPremium, business } =
      await ownedChat(context);
    assertCareerTools(business, isPremium);
    if (!isPremium)
      throw new ApiError(403, "Careers+ is required to save conversations.");
    const body = await parseBody(
      request,
      saveChatSchema.omit({ id: true }),
      4_000_000,
    );
    const { data, error } = await supabase
      .from("assistant_chats")
      .update(body)
      .eq("user_id", user.id)
      .eq("id", id)
      .select("id,title,updated_at")
      .maybeSingle();
    if (error)
      throw new ApiError(
        503,
        "Your latest messages could not be saved. Keep this page open and retry saving.",
      );
    if (!data) throw new ApiError(404, "This chat is no longer available.");
    return json({ chat: data });
  } catch (error) {
    return error instanceof PremiumError
      ? premiumError(error)
      : apiError(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { supabase, user, id } = await ownedChat(context);
    const { error } = await supabase
      .from("assistant_chats")
      .delete()
      .eq("user_id", user.id)
      .eq("id", id);
    if (error)
      throw new ApiError(503, "This chat could not be deleted. Try again.");
    return json({ deleted: true });
  } catch (error) {
    return error instanceof PremiumError
      ? premiumError(error)
      : apiError(error);
  }
}
