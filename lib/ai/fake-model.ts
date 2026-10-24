import "server-only";
import { simulateReadableStream, type LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";

/**
 * Browser tests only: with AI_FAKE_MODEL=1 (CI and the local test script)
 * the chat answers with a fixed text instead of calling Anthropic — no key,
 * no cost. Never on Vercel, whatever the variable says.
 */
export function fakeModelEnabled(): boolean {
  return process.env.AI_FAKE_MODEL === "1" && !process.env.VERCEL;
}

export const FAKE_ANSWER =
  "This is the test assistant. **Returned** means the approver sent the request back to IT.";

export function fakeModel(): LanguageModel {
  return new MockLanguageModelV4({
    // Admin → AI settings → Test the model (one answer, not streamed).
    doGenerate: async () => ({
      content: [{ type: "text", text: "OK" }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: {
          total: 12,
          noCache: 12,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    }),
    doStream: async () => ({
      stream: simulateReadableStream({
        chunkDelayInMs: 20,
        chunks: [
          { type: "text-start", id: "t1" },
          ...FAKE_ANSWER.split(/(?<= )/).map((delta) => ({
            type: "text-delta" as const,
            id: "t1",
            delta,
          })),
          { type: "text-end", id: "t1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            usage: {
              inputTokens: {
                total: 100,
                noCache: 100,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 20, text: 20, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });
}
