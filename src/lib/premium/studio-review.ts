import {
  studioInstructions,
  studioInput,
  studioOutputJsonSchema,
  studioResultSchema,
  type StudioRequest,
} from "./contracts";
import type { openAIClient } from "./providers";
import { PremiumError } from "./http";

export async function generateStudioReview(
  client: ReturnType<typeof openAIClient>,
  input: StudioRequest,
) {
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-6.1-sol",
    instructions: studioInstructions,
    input: studioInput(input),
    store: false,
    max_output_tokens: 6500,
    text: {
      format: {
        type: "json_schema",
        name: "westmere_cv_review",
        strict: true,
        schema: studioOutputJsonSchema,
      },
    },
  });
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
