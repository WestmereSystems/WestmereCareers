import { describe, expect, it, vi } from "vitest";
import { generateStudioReview } from "../src/lib/premium/studio-review";
import type { openAIClient } from "../src/lib/premium/providers";
const output = {
  summary: "Start with the role’s requirements.",
  improvements: ["Choose a relevant example."],
  revisedCv: "",
  coverLetter: "",
  matchedSkills: [],
  missingSkills: [],
  review: null,
};
const input = {
  mode: "chat" as const,
  cv: "",
  goals: "Help me prepare an application.",
  consent: true as const,
};
function provider(status = "completed", text = JSON.stringify(output)) {
  const handlers: Record<string, (event: { snapshot: string }) => void> = {};
  const stream = {
    on: vi.fn((name, handler) => {
      handlers[name] = handler;
    }),
    finalResponse: vi.fn(async () => {
      for (const snapshot of ['{"summary":"Start with', text])
        handlers["response.output_text.delta"]?.({ snapshot });
      return { status, output_text: text };
    }),
  };
  const client = {
    responses: { stream: vi.fn(() => stream), create: vi.fn() },
  };
  return {
    client: client as unknown as ReturnType<typeof openAIClient>,
    stream,
    transport: client.responses,
  };
}
describe("provider streaming integration", () => {
  it("emits safe incremental display fields and validates the final result", async () => {
    const { client, transport } = provider();
    const previews = vi.fn();
    expect(
      await generateStudioReview(client, input, undefined, previews),
    ).toEqual(output);
    expect(previews.mock.calls[0][0]).toEqual({ summary: "Start with" });
    expect(previews.mock.calls[1][0]).toMatchObject({
      summary: output.summary,
      improvements: output.improvements,
    });
    expect(transport.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        store: false,
        text: {
          format: expect.objectContaining({
            type: "json_schema",
            strict: true,
          }),
        },
      }),
      { signal: undefined },
    );
    expect(transport.create).not.toHaveBeenCalled();
  });
  it("rejects incomplete and invalid final output even if partial text was displayed", async () => {
    for (const [status, text] of [
      ["incomplete", JSON.stringify(output)],
      ["completed", '{"summary":"Only a fragment"}'],
    ]) {
      const { client } = provider(status, text);
      await expect(
        generateStudioReview(client, input, undefined, vi.fn()),
      ).rejects.toMatchObject({ status: 502 });
    }
  });
  it("passes cancellation to the SDK and refuses to complete an aborted answer", async () => {
    const abort = new AbortController();
    abort.abort();
    const { client, transport } = provider();
    await expect(
      generateStudioReview(client, input, abort.signal, vi.fn()),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(transport.stream).toHaveBeenCalledWith(expect.anything(), {
      signal: abort.signal,
    });
  });
});
