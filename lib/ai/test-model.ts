import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { APICallError, generateText } from "ai";
import { fakeModel, fakeModelEnabled } from "./fake-model";

export type ModelTest =
  | { ok: true; inputTokens: number; outputTokens: number }
  | { ok: false; message: string };

/**
 * Admin → AI settings → Test the model (F15e-2): one tiny question to
 * Anthropic ("reply OK", at most 5 tokens, 15 s, no retries) to prove the
 * model ID works with our key. Browser tests use the fake model.
 */
export async function testModel(modelId: string): Promise<ModelTest> {
  if (!process.env.ANTHROPIC_API_KEY && !fakeModelEnabled()) {
    return {
      ok: false,
      message: "The Anthropic API key isn't set in the server settings.",
    };
  }
  try {
    const result = await generateText({
      model: fakeModelEnabled()
        ? fakeModel()
        : createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(modelId),
      prompt: "Reply with the single word OK.",
      maxOutputTokens: 5,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(15_000),
    });
    return {
      ok: true,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    };
  } catch (error) {
    return { ok: false, message: testError(error) };
  }
}

/** Anthropic's refusal in plain words. */
export function testError(error: unknown): string {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 404) {
      return "Anthropic doesn't know this model ID — check it against their model list.";
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return "Anthropic refused the API key — check it in the server settings.";
    }
    if (error.statusCode === 429 || error.statusCode === 529) {
      return "Anthropic is busy right now — try again in a minute.";
    }
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "Anthropic didn't answer within 15 seconds — try again.";
  }
  return "The test didn't work — try again, or check the model ID.";
}
