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

/** What the fake robot builds when asked for a "custom report" (F17a). */
export const FAKE_REPORT = {
  title: "E2E custom report",
  parts: [
    {
      title: "People today",
      dataset: "people",
      columns: ["name", "email", "office"],
      sort: [{ by: "name", dir: "asc" }],
    },
    {
      title: "Requests by type",
      dataset: "requests",
      groupBy: [{ field: "type" }],
      measures: [{ fn: "count" }],
      chart: true,
    },
  ],
};

export const FAKE_REPORT_ANSWER =
  "This is the test assistant. Your custom report is ready: open it from the step line above.";

/** What the fake robot prepares when asked to "onboard" someone (F16c). */
export const FAKE_ONBOARDING = {
  firstName: "Meera",
  lastName: "E2E-Chat",
  workEmail: "meera.e2e-chat@example.com",
  jobTitle: "Backend developer",
  department: "Engineering",
  manager: "Omar Haddad",
  office: "Dubai",
  startDate: "2026-11-02",
  nationalities: ["India"],
  applications: [{ name: "Slack", permission: "Regular Member" }],
  equipment: [{ type: "Laptop · macOS" }],
  access: [{ type: "Office access", scope: "Badge" }],
  reasons: { manager: "you said so" },
};

export const FAKE_ONBOARDING_ANSWER =
  "This is the test assistant. The draft is ready with its suggestions: open it from the step line above.";
export const FAKE_NOT_NOW_ANSWER =
  "This is the test assistant. Fine, nothing was created.";

/** What the fake robot writes when asked for section 9's notes (F16e-3). */
export const FAKE_NOTES =
  "Slack: Regular Member granted, invite sent.\nLaptop enrolled in MDM.";
export const FAKE_NOTES_ANSWER =
  "This is the test assistant. The notes wait on section 9 for you to accept.";

/** Batches by chat (F17b-4): a list attached, then "create the drafts". */
export const FAKE_BATCH_ANSWER =
  "This is the test assistant. I read the list into a batch: open it from the step line above.";
export const FAKE_BATCH_DRAFTS_ANSWER =
  "This is the test assistant. The drafts are created; each is executed and signed one by one.";

type Prompt = Parameters<MockLanguageModelV4["doStream"]>[0]["prompt"];

/** The last batch a tool read back in this chat: its ready / other names. */
function lastBatch(prompt: Prompt) {
  for (const message of [...prompt].reverse()) {
    if (message.role !== "tool") continue;
    for (const part of message.content) {
      if (part.type !== "tool-result" || part.output.type !== "json") continue;
      const v = part.output.value as {
        batchId?: string;
        readyNames?: string[];
        notCreated?: { name: string }[];
      } | null;
      if (v?.batchId && v.readyNames && v.notCreated)
        return {
          batchId: v.batchId,
          create: v.readyNames,
          notCreated: v.notCreated.map((n) => n.name),
        };
    }
  }
  return undefined;
}

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
    doStream: async ({ prompt }) => {
      // A tool result came back: answer in words. Asked for a "custom
      // report" (browser test, F17a): build one first.
      const last = prompt.at(-1);
      const asked =
        last?.role === "user"
          ? last.content.map((p) => (p.type === "text" ? p.text : "")).join("")
          : "";
      const report = /custom report/i.test(asked);
      // "Onboard …" (browser test, F16c): prepare a draft — it waits for Confirm.
      const onboard = !report && /\bonboard\b/i.test(asked);
      // "… implementation notes for UAM-…" (browser test, F16e-3): a draft
      // of section 9's notes on that ticket.
      const ticket = /implementation notes/i.test(asked)
        ? asked.match(/UAM-\d{4}-\d{6}/)?.[0]
        : undefined;
      // A paperclip list (F17b-4): read its batch; "create the drafts": confirm it.
      const batchId = asked.match(/\(batch ([0-9a-f-]{36})\)/)?.[1];
      const drafts = /create the drafts/i.test(asked)
        ? lastBatch(prompt)
        : undefined;
      const toolCall =
        report ||
        onboard ||
        Boolean(ticket) ||
        Boolean(batchId) ||
        Boolean(drafts);
      const result = last?.role === "tool" ? JSON.stringify(last.content) : "";
      const text = !result
        ? FAKE_ANSWER
        : result.includes("execution-denied")
          ? FAKE_NOT_NOW_ANSWER
          : result.includes("createBatchDrafts")
            ? FAKE_BATCH_DRAFTS_ANSWER
            : result.includes("getBatch")
              ? FAKE_BATCH_ANSWER
              : result.includes("createOnboardingDraft")
                ? FAKE_ONBOARDING_ANSWER
                : result.includes("suggestValues")
                  ? FAKE_NOTES_ANSWER
                  : FAKE_REPORT_ANSWER;
      return {
        stream: simulateReadableStream({
          chunkDelayInMs: 20,
          chunks: [
            ...(toolCall
              ? [
                  {
                    type: "tool-call" as const,
                    toolCallId: `fake-${Date.now()}`,
                    toolName: report
                      ? "saveCustomReport"
                      : ticket
                        ? "suggestValues"
                        : batchId
                          ? "getBatch"
                          : drafts
                            ? "createBatchDrafts"
                            : "createOnboardingDraft",
                    input: JSON.stringify(
                      report
                        ? { definition: FAKE_REPORT }
                        : ticket
                          ? { ticket, implementationNotes: FAKE_NOTES }
                          : batchId
                            ? { batchId }
                            : (drafts ?? FAKE_ONBOARDING),
                    ),
                  },
                ]
              : [
                  { type: "text-start" as const, id: "t1" },
                  ...text.split(/(?<= )/).map((delta) => ({
                    type: "text-delta" as const,
                    id: "t1",
                    delta,
                  })),
                  { type: "text-end" as const, id: "t1" },
                ]),
            {
              type: "finish",
              finishReason: {
                unified: toolCall ? "tool-calls" : "stop",
                raw: undefined,
              },
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
      };
    },
  });
}
