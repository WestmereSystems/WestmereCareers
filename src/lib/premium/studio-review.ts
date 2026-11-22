import {
  studioInstructions,
  studioInput,
  studioOutputJsonSchema,
  studioResultSchema,
  type StudioRequest,
} from "./contracts";
import type { openAIClient } from "./providers";
import { PremiumError } from "./http";
import { assistantPreview, type AssistantPreview } from "./assistant-preview";

export async function generateStudioReview(
  client: ReturnType<typeof openAIClient>,
  input: StudioRequest,
  signal?: AbortSignal,
  onPreview?: (preview: AssistantPreview) => void,
) {
  const parameters = {
    model: process.env.OPENAI_MODEL || "gpt-6.1-sol",
    instructions: studioInstructions,
    input: studioInput(input),
    store: false,
    max_output_tokens: 6500,
    text: {
      format: {
        type: "json_schema" as const,
        name: "westmere_cv_review",
        strict: true,
        schema: studioOutputJsonSchema,
      },
    },
  };
  let response;
  if (onPreview) {
    const stream = client.responses.stream(parameters, { signal });
    let lastPreview = "";
    stream.on("response.output_text.delta", (event) => {
      const preview = assistantPreview(event.snapshot);
      const serialized = JSON.stringify(preview);
      if (serialized !== lastPreview) {
        lastPreview = serialized;
        onPreview(preview);
      }
    });
    response = await stream.finalResponse();
  } else response = await client.responses.create(parameters, { signal });
  signal?.throwIfAborted();
  if (response.status !== "completed" || !response.output_text)
    throw new PremiumError(
      "GENERATION_INCOMPLETE",
      "The studio could not complete this request. Your allowance will be returned. Try a shorter CV.",
      502,
    );
  let result: unknown;
  try {
    result = JSON.parse(response.output_text);
  } catch {
    throw new PremiumError(
      "INVALID_OUTPUT",
      "The studio could not produce a complete review. Your allowance will be returned.",
      502,
    );
  }
  const validated = studioResultSchema.safeParse(result);
  if (!validated.success)
    throw new PremiumError(
      "INVALID_OUTPUT",
      "The studio could not produce a complete review. Your allowance will be returned.",
      502,
    );
  return validated.data;
}
