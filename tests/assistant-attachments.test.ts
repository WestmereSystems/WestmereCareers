import { expect, it } from "vitest";
import {
  attachmentLimitError,
  attachmentText,
  type AssistantAttachment,
} from "../src/lib/assistant-attachments";
import { chatSnapshotSchema } from "../src/lib/assistant-chats";
const files = (n: number): AssistantAttachment[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `60000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    filename: `CV ${i}.txt`,
    text: "Synthetic document text with CRM experience.",
  }));
it("retains ten individually removable attachments with explicit source boundaries and rejects an eleventh", () => {
  expect(attachmentLimitError(files(10))).toBe("");
  expect(attachmentLimitError(files(11))).toContain("10");
  expect(attachmentText(files(2))).toContain("Document: CV 1.txt\nSynthetic");
  const snapshot = chatSnapshotSchema.parse({
    entries: [],
    cv: attachmentText(files(10)),
    filename: "CV 0.txt",
    description: "",
    attachments: files(10),
  });
  expect(snapshot.attachments).toHaveLength(10);
});
it("bounds combined model context and keeps legacy saved chats readable", () => {
  expect(
    attachmentLimitError([{ ...files(1)[0], text: "a".repeat(24001) }]),
  ).toContain("24,000");
  expect(
    chatSnapshotSchema.safeParse({
      entries: [],
      cv: "Legacy document",
      filename: "CV.txt",
      description: "",
    }).success,
  ).toBe(true);
  expect(
    chatSnapshotSchema.safeParse({
      entries: [],
      cv: "",
      filename: "",
      description: "",
      attachments: files(11),
    }).success,
  ).toBe(false);
});
