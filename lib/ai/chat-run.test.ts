// @vitest-environment node
import { simulateReadableStream, type UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, test, vi } from "vitest";
import { chatTitle, runChat, type AiStatus, type ChatDeps } from "./chat-run";

vi.mock("server-only", () => ({}));

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
  db: {} as never,
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
    // The question is saved before the answer streams, the answer after.
    const calls = vi.mocked(d.saveMessages).mock.calls as unknown as [
      string,
      UIMessage[],
      number,
    ][];
    expect(calls.map((c) => c[0])).toEqual([CHAT, CHAT]);
    expect(calls.map((c) => c[1].map((m) => m.role))).toEqual([
      ["user"],
      ["assistant"],
    ]);
    expect(calls[1][2]).toBe(1);

    // The model got the instructions and only the tools the roles allow.
    const call = model.doStreamCalls[0];
    expect(JSON.stringify(call.prompt)).toContain(
      "You are the Laine assistant.",
    );
    expect(call.tools?.map((t) => t.name)).toEqual(["getAppHelp", "runReport"]);
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
    await vi.waitFor(() => expect(d.saveMessages).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(d.saveMessages).mock.calls as unknown as [
      string,
      UIMessage[],
    ][];
    // Only the new question and the new answer — not the history again.
    expect(calls.map((c) => c[1].length)).toEqual([1, 1]);
    expect(calls[0][1][0].parts).toEqual([
      { type: "text", text: "And Closed?" },
    ]);
  });

  test("old thinking is never sent back or saved (Anthropic refuses its sealed signature)", async () => {
    const history: UIMessage[] = [
      { id: "a", role: "user", parts: [{ type: "text", text: "Slack?" }] },
      {
        id: "b",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            text: "Run the access report.",
            providerMetadata: { anthropic: { signature: "sealed" } },
          },
          { type: "text", text: "Two people." },
        ],
      },
    ];
    const { d, model } = deps({ loadMessages: vi.fn(async () => history) });
    await (await runChat(question("And Bangladesh?"), person, d)).text();
    const prompt = JSON.stringify(model.doStreamCalls[0].prompt);
    expect(prompt).toContain("Two people.");
    expect(prompt).not.toContain("Run the access report.");
    expect(prompt).not.toContain("sealed");
    await vi.waitFor(() => expect(d.saveMessages).toHaveBeenCalledTimes(2));
    const saved = vi
      .mocked(d.saveMessages)
      .mock.calls.flatMap((c) => c[1] as UIMessage[]);
    expect(
      saved.flatMap((m) => m.parts).some((p) => p.type === "reasoning"),
    ).toBe(false);
  });

  test("the answer is finished and saved even after the browser disconnects", async () => {
    const work: (() => Promise<unknown>)[] = [];
    const { d } = deps({ keepRunning: (w) => work.push(w) });
    // The browser hangs up at once (tab closed): the server still finishes.
    const res = await runChat(question(), person, d);
    await res.body?.cancel();
    expect(work).toHaveLength(1);
    await work[0]();
    const calls = vi.mocked(d.saveMessages).mock.calls as unknown as [
      string,
      UIMessage[],
    ][];
    expect(calls.map((c) => c[1][0].role)).toEqual(["user", "assistant"]);
    expect(d.recordUsage).toHaveBeenCalledWith(1, 120, 30);
  });

  test("Try again after a lost answer doesn't save the question twice", async () => {
    const history: UIMessage[] = [
      { id: "a", role: "user", parts: [{ type: "text", text: "Hi" }] },
      { id: "b", role: "assistant", parts: [{ type: "text", text: "Hello." }] },
      {
        id: "c",
        role: "user",
        parts: [{ type: "text", text: "What does Returned mean?" }],
      },
    ];
    const { d, model } = deps({ loadMessages: vi.fn(async () => history) });
    await (await runChat(question(), person, d)).text();
    await vi.waitFor(() => expect(d.saveMessages).toHaveBeenCalledTimes(1));
    const calls = vi.mocked(d.saveMessages).mock.calls as unknown as [
      string,
      UIMessage[],
    ][];
    expect(calls[0][1].map((m) => m.role)).toEqual(["assistant"]);
    const prompt = JSON.stringify(model.doStreamCalls[0].prompt);
    expect(prompt.split("What does Returned mean?")).toHaveLength(2);
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
