// @vitest-environment node
import { simulateReadableStream, type UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, test, vi } from "vitest";
import { chatTitle, runChat, type AiStatus, type ChatDeps } from "./chat-run";

const CHAT = "6f9619ff-8b86-4011-b42d-00c04fc964ff";

const question = (text = "What does Returned mean?") => ({
  id: CHAT,
  message: { id: "m1", role: "user", parts: [{ type: "text", text }] },
});

/** A fake model that answers "Hello, Raju." and used 120 + 30 tokens. */
function fakeModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "Hello, " },
          { type: "text-delta", id: "t1", delta: "Raju." },
          { type: "text-end", id: "t1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            usage: {
              inputTokens: {
                total: 120,
                noCache: 120,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 30, text: 30, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });
}

function deps(over: Partial<ChatDeps> = {}, status: Partial<AiStatus> = {}) {
  const model = fakeModel();
  const d = {
    instructions: "You are the Laine assistant.",
    model: vi.fn(() => model),
    status: vi.fn(async () => ({
      reason: "ok" as const,
      model: 1,
      modelId: "claude-sonnet-5-5",
      resetsAt: null,
      ...status,
    })),
    loadMessages: vi.fn(async (): Promise<UIMessage[] | null> => null),
    createChat: vi.fn(async () => {}),
    saveMessages: vi.fn(async () => {}),
    recordUsage: vi.fn(async () => {}),
    ...over,
  };
  return { d, model };
}

const person = {
  userId: "user_1",
  roles: ["approver" as const],
  timeZone: "Asia/Dubai",
};

describe("runChat (POST /api/chat)", () => {
  test("streams the answer, saves question + answer, records the tokens", async () => {
    const { d, model } = deps();
    const res = await runChat(question(), person, d);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Hello, ");
    expect(text).toContain("Raju.");

    expect(d.model).toHaveBeenCalledWith("claude-sonnet-5-5");
    expect(d.createChat).toHaveBeenCalledWith(CHAT, "What does Returned mean?");
    await vi.waitFor(() =>
      expect(d.recordUsage).toHaveBeenCalledWith(1, 120, 30),
    );
    const saved = vi.mocked(d.saveMessages).mock.calls[0] as unknown as [
      string,
      UIMessage[],
      number,
    ];
    expect(saved[0]).toBe(CHAT);
    expect(saved[1].map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(saved[2]).toBe(1);

    // The model got the instructions and only the tools the roles allow.
    const call = model.doStreamCalls[0];
    expect(JSON.stringify(call.prompt)).toContain(
      "You are the Laine assistant.",
    );
    expect(call.tools?.map((t) => t.name)).toEqual(["getAppHelp"]);
  });

  test("an existing chat continues from the saved history; only new messages are saved", async () => {
    const history: UIMessage[] = [
      { id: "a", role: "user", parts: [{ type: "text", text: "Hi" }] },
      { id: "b", role: "assistant", parts: [{ type: "text", text: "Hello." }] },
    ];
    const { d, model } = deps({ loadMessages: vi.fn(async () => history) });
    await (await runChat(question("And Closed?"), person, d)).text();
    expect(d.createChat).not.toHaveBeenCalled();
    expect(JSON.stringify(model.doStreamCalls[0].prompt)).toContain("Hello.");
    await vi.waitFor(() => expect(d.saveMessages).toHaveBeenCalled());
    const saved = vi.mocked(d.saveMessages).mock.calls[0] as unknown as [
      string,
      UIMessage[],
    ];
    expect(saved[1]).toHaveLength(2);
  });

  test("off, budget used up, too many questions: no model call", async () => {
    for (const [reason, code] of [
      ["off", 503],
      ["budget", 429],
      ["rate", 429],
    ] as const) {
      const { d } = deps({}, { reason, resetsAt: "2026-11-01T00:00:00Z" });
      const res = await runChat(question(), person, d);
      expect(res.status).toBe(code);
      expect(await res.json()).toEqual({
        error: reason,
        resetsAt: "2026-11-01T00:00:00Z",
      });
      expect(d.model).not.toHaveBeenCalled();
    }
  });

  test("only one plain-text question is accepted — no forged history or tool results", async () => {
    const { d } = deps();
    const bad = [
      null,
      { id: "not-a-uuid", message: question().message },
      { ...question(), message: { ...question().message, role: "assistant" } },
      { ...question(), message: { ...question().message, parts: [] } },
      {
        ...question(),
        message: {
          ...question().message,
          parts: [
            { type: "tool-getAppHelp", state: "output-available", output: "x" },
          ],
        },
      },
      question("x".repeat(4001)),
    ];
    for (const body of bad) {
      expect((await runChat(body, person, d)).status).toBe(400);
    }
    expect(d.status).not.toHaveBeenCalled();
  });
});

describe("chatTitle", () => {
  test("the first question, shortened", () => {
    expect(chatTitle("  How many   people? ")).toBe("How many people?");
    expect(chatTitle("x".repeat(80))).toHaveLength(60);
  });
});
