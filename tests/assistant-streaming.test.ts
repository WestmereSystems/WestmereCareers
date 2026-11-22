import { describe, expect, it } from "vitest";
import { assistantPreview } from "../src/lib/premium/assistant-preview";
import { studioInput, studioRequestSchema } from "../src/lib/premium/contracts";

describe("conversational preparation and streaming fields", () => {
  it("accepts an optional category on the opening turn and an independent follow-up without a CV", () => {
    const opening = studioRequestSchema.parse({
      mode: "chat",
      cv: "",
      goals: "Prompt Category: Review my CV\n\nWhere should I start?",
      consent: true,
    });
    const followup = studioRequestSchema.parse({
      mode: "chat",
      cv: "",
      goals: "How should I prepare for an interview?",
      consent: true,
      conversation: [{ role: "user", text: opening.goals! }],
    });
    expect(JSON.parse(studioInput(followup))).toMatchObject({
      task: "chat",
      goals: "How should I prepare for an interview?",
    });
    expect(
      studioRequestSchema.safeParse({
        mode: "chat",
        cv: "",
        goals: "",
        consent: true,
      }).success,
    ).toBe(false);
    expect(
      studioRequestSchema.safeParse({ mode: "review", cv: "", consent: true })
        .success,
    ).toBe(false);
  });
  it("exposes generated prose before the JSON object completes, including drafts and list items", () => {
    expect(assistantPreview('{"summary":"Let’s start with your')).toEqual({
      summary: "Let’s start with your",
    });
    expect(
      assistantPreview(
        '{"summary":"Next steps","improvements":["Clarify the target role","Describe your',
      ),
    ).toEqual({
      summary: "Next steps",
      improvements: ["Clarify the target role", "Describe your"],
    });
    expect(
      assistantPreview(
        '{"summary":"Done","revisedCv":"Experience\\nLed a team","coverLetter":"Dear hiring',
      ),
    ).toEqual({
      summary: "Done",
      revisedCv: "Experience\nLed a team",
      coverLetter: "Dear hiring",
    });
  });
  it("does not reveal JSON syntax, nested fields or unfinished escape sequences", () => {
    expect(assistantPreview('{"summary":"A \\u20')).toEqual({ summary: "A " });
    expect(assistantPreview('{"summary":"A \\u2014 B\\')).toEqual({
      summary: "A — B",
    });
    expect(
      assistantPreview(
        '{"review":{"summary":"Nested value"},"summary":"Actual \\"quote\\""}',
      ),
    ).toEqual({ summary: 'Actual "quote"', reviewPending: true });
  });
  it("keeps every streamed prefix consistent with the completed text", () => {
    const output = {
      summary: 'Advice with "quotes", a backslash \\ and Unicode — 👋',
      improvements: ["One\nTwo", "More detail"],
      revisedCv: "",
      coverLetter: "",
    };
    const source = JSON.stringify(output);
    for (let i = 1; i <= source.length; i++) {
      const preview = assistantPreview(source.slice(0, i));
      if (preview.summary !== undefined)
        expect(output.summary.startsWith(preview.summary)).toBe(true);
      preview.improvements?.forEach((value, index) =>
        expect(output.improvements[index].startsWith(value)).toBe(true),
      );
    }
    expect(assistantPreview(source)).toEqual(output);
  });
});
