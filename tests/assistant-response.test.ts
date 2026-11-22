import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: () => ({ rpc: mocks.rpc }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
import { assistantResponse } from "../src/lib/premium/assistant-response";
const attempt = "60000000-0000-4000-8000-000000000001";
const result = {
  summary: "Document ready for review",
  improvements: [],
  revisedCv: "",
  coverLetter: "",
  matchedSkills: [],
  missingSkills: [],
};
const options = {
  reservation: "reservation",
  paid: true,
  userId: "user",
  principal: "a".repeat(64),
};
function request(signal?: AbortSignal) {
  return new Request("https://westmere.test/api/studio", {
    method: "POST",
    signal,
    headers: { accept: "text/event-stream", "x-westmere-attempt": attempt },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});
describe("assistant progress and stop accounting", () => {
  it("streams prose before completion without charging an unfinished answer", async () => {
    let finish!: (value: typeof result) => void;
    const response = await assistantResponse(request(), {
      ...options,
      generate: (_signal, onPreview) => {
        onPreview?.({ summary: "Here is the beginning" });
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    });
    const reader = response.body!.getReader();
    let output = "";
    while (!output.includes('"type":"preview"')) {
      output += new TextDecoder().decode((await reader.read()).value);
    }
    expect(output).toContain("Here is the beginning");
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "complete_assistant_attempt",
      expect.anything(),
    );
    finish(result);
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      output += new TextDecoder().decode(chunk.value);
    }
    expect(output).toContain('"type":"result"');
    expect(mocks.rpc).toHaveBeenCalledWith(
      "complete_assistant_attempt",
      expect.anything(),
    );
  });
  it("delivers progress while generation is pending, then settles and returns a complete answer", async () => {
    let finish!: (value: typeof result) => void;
    const generate = vi.fn(
      () =>
        new Promise<typeof result>((resolve) => {
          finish = resolve;
        }),
    );
    const response = await assistantResponse(request(), {
      ...options,
      generate,
    });
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      '"step":"received"',
    );
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    finish(result);
    let output = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      output += new TextDecoder().decode(chunk.value);
    }
    expect(output).toContain('"type":"result"');
    expect(mocks.rpc).toHaveBeenCalledWith("complete_assistant_attempt", {
      p_attempt: attempt,
      p_principal: options.principal,
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "settle_ai_usage",
      expect.anything(),
    );
  });
  it("aborts the provider and returns the reservation when Stop disconnects before any answer", async () => {
    const abort = new AbortController();
    const generate = vi.fn(
      (signal: AbortSignal) =>
        new Promise<typeof result>((_, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Stopped", "AbortError")),
            { once: true },
          ),
        ),
    );
    const response = await assistantResponse(request(abort.signal), {
      ...options,
      generate,
    });
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    abort.abort();
    expect(await response.text()).not.toContain('"type":"result"');
    expect(mocks.rpc).toHaveBeenCalledWith("settle_ai_usage", {
      p_reservation_id: options.reservation,
      p_success: false,
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "complete_assistant_attempt",
      expect.anything(),
    );
  });
  it("does not deliver or charge a late model result after cancellation won the database race", async () => {
    mocks.rpc.mockImplementation(async (name) => ({
      data: name !== "complete_assistant_attempt",
      error: null,
    }));
    const response = await assistantResponse(request(), {
      ...options,
      generate: async () => result,
    });
    const body = await response.text();
    expect(body).toContain("REQUEST_STOPPED");
    expect(body).not.toContain('"type":"result"');
    expect(mocks.rpc).toHaveBeenCalledWith("settle_ai_usage", {
      p_reservation_id: options.reservation,
      p_success: false,
    });
  });
  it("does not call the provider when Stop arrived before registration", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const generate = vi.fn();
    const response = await assistantResponse(request(), {
      ...options,
      paid: false,
      generate,
    });
    expect(await response.text()).toContain("REQUEST_STOPPED");
    expect(generate).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("settle_trial_ai_usage", {
      p_reservation: options.reservation,
      p_success: false,
    });
  });
});
