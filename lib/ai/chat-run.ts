import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type LanguageModel,
  type UIMessage,
} from "ai";
import * as z from "zod";
import { MAX_QUESTION_LENGTH } from "./chat-ui";
import { toolApprovalFor, toolsFor } from "./tools/registry";
import type { ToolContext } from "./tools/types";

/** What ai_status() says (F15a): may this person ask now? */
export type AiStatus = {
  reason: "ok" | "off" | "budget" | "rate";
  model: number;
  modelId: string;
  resetsAt: string | null;
};

/** The database and the model, passed in so tests can use fakes. */
export type ChatDeps = {
  status: () => Promise<AiStatus>;
  /** The chat's messages, or null when it doesn't exist (or isn't the person's — RLS). */
  loadMessages: (chatId: string) => Promise<UIMessage[] | null>;
  createChat: (chatId: string, title: string) => Promise<void>;
  saveMessages: (
    chatId: string,
    messages: UIMessage[],
    model: number,
  ) => Promise<void>;
  recordUsage: (
    model: number,
    inputTokens: number,
    outputTokens: number,
  ) => Promise<void>;
  model: (modelId: string) => LanguageModel;
  instructions: string;
};

/** Who asks — with their own database client for the tools (RLS). */
export type ChatPerson = ToolContext;

/** Up to 5 steps (tool calls and the answer), and short answers. */
const MAX_STEPS = 5;
const MAX_OUTPUT_TOKENS = 4000;

/**
 * The browser sends only the new question and the chat's id; the history
 * comes from our database (the person's own chats — RLS), so nobody can
 * slip a fake earlier answer or tool result into the conversation.
 */
export const chatRequestSchema = z.object({
  id: z.uuid(),
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.literal("user"),
    parts: z
      .array(
        z.object({
          type: z.literal("text"),
          text: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
        }),
      )
      .length(1),
  }),
});

/** A new chat is named after its first question. */
export function chatTitle(question: string): string {
  const text = question.replace(/\s+/g, " ").trim();
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

/**
 * The model's thinking is never kept: Anthropic seals it to the exact
 * conversation it was written in, and our instructions change every minute
 * (they hold the time), so sending it back fails the next question
 * ("Invalid 'signature' in 'thinking' block"). The model doesn't need it.
 */
export function withoutThinking(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.filter((p) => p.type !== "reasoning"),
  }));
}

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status });

/**
 * One question → a streamed answer (POST /api/chat). Checks the request and
 * the limits first; saves the question and the answer and records the cost
 * when the answer is complete.
 */
export async function runChat(
  body: unknown,
  person: ChatPerson,
  deps: ChatDeps,
): Promise<Response> {
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return json(400, { error: "bad_request" });
  const { id, message } = parsed.data;

  const status = await deps.status();
  if (status.reason !== "ok") {
    return json(status.reason === "off" ? 503 : 429, {
      error: status.reason,
      resetsAt: status.resetsAt,
    });
  }

  let history = await deps.loadMessages(id);
  if (history === null) {
    await deps.createChat(id, chatTitle(message.parts[0].text));
    history = [];
  }

  const tools = toolsFor(person);
  const messages = await validateUIMessages({
    // Chats saved before this rule may still hold thinking: dropped here.
    messages: withoutThinking([...history, message as UIMessage]),
    tools,
  });
  // The question is saved before the answer streams, so a quick next
  // question finds it (and the chat) already there.
  await deps.saveMessages(id, [messages[messages.length - 1]], status.model);
  const saved = messages.length;

  const result = streamText({
    model: deps.model(status.modelId),
    instructions: deps.instructions,
    messages: await convertToModelMessages(messages),
    tools,
    toolApproval: toolApprovalFor(person.roles),
    stopWhen: isStepCount(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onEnd: async ({ messages: all }) => {
        try {
          await deps.saveMessages(
            id,
            withoutThinking(all.slice(saved)),
            status.model,
          );
          const usage = await result.totalUsage;
          await deps.recordUsage(
            status.model,
            usage.inputTokens ?? 0,
            usage.outputTokens ?? 0,
          );
        } catch (error) {
          console.error("Could not save the assistant chat", error);
        }
      },
    }),
  });
}
