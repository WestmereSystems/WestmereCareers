import { z } from "zod";
export const MAX_ASSISTANT_ATTACHMENTS = 10;
export const MAX_ASSISTANT_DOCUMENT_TEXT = 24000;
export const assistantAttachmentSchema = z
  .object({
    id: z.uuid(),
    filename: z.string().min(1).max(255),
    text: z.string().min(1).max(MAX_ASSISTANT_DOCUMENT_TEXT),
  })
  .strict();
export type AssistantAttachment = z.infer<typeof assistantAttachmentSchema>;
export function attachmentText(attachments: AssistantAttachment[]) {
  if (attachments.length === 1) return attachments[0].text;
  return attachments
    .map((file) => `Document: ${file.filename}\n${file.text}`)
    .join("\n\n");
}
export function attachmentLimitError(attachments: AssistantAttachment[]) {
  if (attachments.length > MAX_ASSISTANT_ATTACHMENTS)
    return "Attach up to 10 documents per conversation. Remove a document before adding another.";
  if (attachmentText(attachments).length > MAX_ASSISTANT_DOCUMENT_TEXT)
    return "The attached documents exceed 24,000 characters of extracted text in total. Remove a document or upload shorter relevant sections.";
  return "";
}
