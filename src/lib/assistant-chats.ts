import { z } from "zod";
import {
  assistantAttachmentSchema,
  attachmentLimitError,
} from "./assistant-attachments";
import { studioResultSchema } from "./premium/contracts";

export const chatEntrySchema = z
  .object({
    id: z.uuid(),
    role: z.enum(["user", "assistant"]),
    text: z.string().max(4000),
    result: studioResultSchema.optional(),
    attachments: z
      .array(assistantAttachmentSchema.pick({ id: true, filename: true }))
      .max(10)
      .optional(),
  })
  .strict();
export const chatSnapshotSchema = z
  .object({
    entries: z.array(chatEntrySchema).max(400),
    cv: z.string().max(24000),
    filename: z.string().max(255),
    description: z.string().max(16000),
    jobTitle: z.string().max(200).optional(),
    attachments: z.array(assistantAttachmentSchema).max(10).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const error = attachmentLimitError(value.attachments || []);
    if (error)
      context.addIssue({
        code: "custom",
        path: ["attachments"],
        message: error,
      });
  });
export const saveChatSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(100),
    snapshot: chatSnapshotSchema,
  })
  .strict();
export type ChatEntry = z.infer<typeof chatEntrySchema>;
export type ChatSnapshot = z.infer<typeof chatSnapshotSchema>;
export type SavedChat = { id: string; title: string; updated_at: string };
export const MAX_SAVED_CHATS = 10;
export function chatTitle(entries: ChatEntry[]) {
  return (
    entries
      .find(
        (entry) => entry.role === "user" && !entry.text.startsWith("Attached "),
      )
      ?.text.replace(/^Prompt Category: [^\n]+\n\n/, "")
      .slice(0, 100) || "New conversation"
  );
}
