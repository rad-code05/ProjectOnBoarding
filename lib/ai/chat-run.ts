import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  isToolUIPart,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type LanguageModel,
  type UIMessage,
} from "ai";
import * as z from "zod";
import { MAX_QUESTION_LENGTH, isRefused, withRefusedText } from "./chat-ui";
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
  /**
   * The answer that waited for a Confirm, continued: saved in place of the
   * stored one (messages are never edited — a new row, then the old one goes).
   */
  replaceMessage: (
    chatId: string,
    oldId: string,
    message: UIMessage,
    model: number,
  ) => Promise<void>;
  recordUsage: (
    model: number,
    inputTokens: number,
    outputTokens: number,
  ) => Promise<void>;
  model: (modelId: string) => LanguageModel;
  instructions: string;
  /**
   * Keeps the server working after the response has ended (Next's after()),
   * so an answer is finished and saved even when the browser disconnects.
   */
  keepRunning?: (work: () => Promise<unknown>) => void;
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
export const questionSchema = z.object({
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

/**
 * A Confirm / Not now on a write the assistant asked to do (F16c): only the
 * approval's id and the answer travel; the request it answers must be the
 * last answer in the person's own saved chat.
 */
export const approvalSchema = z.object({
  id: z.uuid(),
  approval: z.object({
    id: z.string().min(1).max(200),
    approved: z.boolean(),
  }),
});

export const chatRequestSchema = z.union([questionSchema, approvalSchema]);

/**
 * The saved chat with this approval answered, or null when the last answer
 * doesn't wait for it (already answered, another chat, a forged id).
 */
export function answerApproval(
  history: UIMessage[],
  approvalId: string,
  approved: boolean,
): UIMessage[] | null {
  const last = history[history.length - 1];
  if (last?.role !== "assistant") return null;
  let found = false;
  const parts = last.parts.map((part) => {
    if (
      isToolUIPart(part) &&
      part.state === "approval-requested" &&
      part.approval.id === approvalId
    ) {
      found = true;
      return {
        ...part,
        state: "approval-responded" as const,
        approval: { ...part.approval, approved },
      };
    }
    return part;
  });
  return found
    ? [...history.slice(0, -1), { ...last, parts } as UIMessage]
    : null;
}

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

/**
 * What the model gets: the chat without refused questions and their
 * refusals (they stay visible in the chat). The safety filter reads the
 * whole conversation, so an earlier attack could get the next, harmless
 * question refused as well.
 */
export function withoutRefused(messages: UIMessage[]): UIMessage[] {
  const kept: UIMessage[] = [];
  for (const m of messages) {
    if (isRefused(m)) {
      if (kept[kept.length - 1]?.role === "user") kept.pop();
      continue;
    }
    kept.push(m);
  }
  return kept;
}

/** The chat ends with this very question and no answer yet. */
export function isUnanswered(history: UIMessage[], question: string): boolean {
  const last = history[history.length - 1];
  if (last?.role !== "user") return false;
  const text = last.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
  return text === question.trim();
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
  const { id } = parsed.data;

  const status = await deps.status();
  if (status.reason !== "ok") {
    return json(status.reason === "off" ? 503 : 429, {
      error: status.reason,
      resetsAt: status.resetsAt,
    });
  }

  const tools = toolsFor(person);
  let history = await deps.loadMessages(id);
  let messages: UIMessage[];
  let saved: number;
  // The stored answer a Confirm continues (replaced when it is complete).
  let replaces: string | null = null;

  if ("approval" in parsed.data) {
    const { approval } = parsed.data;
    const answered = history
      ? answerApproval(history, approval.id, approval.approved)
      : null;
    if (!answered) return json(409, { error: "approval_gone" });
    messages = await validateUIMessages({
      messages: withoutThinking(answered),
      tools,
    });
    replaces = answered[answered.length - 1].id;
    saved = messages.length - 1;
  } else {
    const { message } = parsed.data;
    if (history === null) {
      await deps.createChat(id, chatTitle(message.parts[0].text));
      history = [];
    }
    // "Try again" after a lost answer sends the same question again: it is
    // already saved (last, unanswered), so it isn't saved twice.
    const retry = isUnanswered(history, message.parts[0].text);
    messages = await validateUIMessages({
      // Chats saved before this rule may still hold thinking: dropped here.
      messages: withoutThinking(
        retry ? history : [...history, message as UIMessage],
      ),
      tools,
    });
    // The question is saved before the answer streams, so a quick next
    // question finds it (and the chat) already there.
    if (!retry) {
      await deps.saveMessages(
        id,
        [messages[messages.length - 1]],
        status.model,
      );
    }
    saved = messages.length;
  }

  const result = streamText({
    model: deps.model(status.modelId),
    instructions: deps.instructions,
    messages: await convertToModelMessages(withoutRefused(messages)),
    tools,
    toolApproval: toolApprovalFor(person.roles),
    stopWhen: isStepCount(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

  let answerSaved = () => {};
  const saving = new Promise<void>((resolve) => (answerSaved = resolve));
  const answer = toUIMessageStream({
    stream: result.stream,
    originalMessages: messages,
    onEnd: async ({ messages: all }) => {
      try {
        let answer = withoutThinking(all.slice(saved));
        if ((await result.finishReason) === "content-filter") {
          answer = answer.map(withRefusedText);
        }
        if (replaces && answer.length) {
          await deps.replaceMessage(id, replaces, answer[0], status.model);
          answer = answer.slice(1);
        }
        await deps.saveMessages(id, answer, status.model);
        const usage = await result.totalUsage;
        await deps.recordUsage(
          status.model,
          usage.inputTokens ?? 0,
          usage.outputTokens ?? 0,
        );
      } catch (error) {
        console.error("Could not save the assistant chat", error);
      } finally {
        answerSaved();
      }
    },
  });

  // Two copies of the answer: one for the browser, one the server reads to
  // the end itself. If the browser goes away (tab closed, connection lost),
  // the server's copy still finishes, so the answer is saved and shows after
  // a reload. after() keeps the server running for it.
  if (!deps.keepRunning)
    return createUIMessageStreamResponse({ stream: answer });
  const [toBrowser, toServer] = answer.tee();
  deps.keepRunning(async () => {
    const reader = toServer.getReader();
    while (!(await reader.read()).done) {
      // only reading, so the answer runs to the end
    }
    await saving;
  });
  return createUIMessageStreamResponse({ stream: toBrowser });
}
