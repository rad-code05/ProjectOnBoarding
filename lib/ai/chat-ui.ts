import type { UIMessage } from "ai";
import type { Role } from "@/lib/auth";

/** The longest question the assistant accepts (characters). */
export const MAX_QUESTION_LENGTH = 4000;

/** "Good morning, Raju." — by the hour on the person's own clock. */
export function greeting(name: string, hour: number): string {
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `Good ${part}, ${name}.`;
}

/**
 * Questions to start with (board: Assistant chat): one report question, one
 * about the app, one about their own work.
 */
export function starterQuestions(roles: readonly Role[]): string[] {
  const it = roles.some(
    (r) => r === "admin" || r === "requester" || r === "it_operator",
  );
  return it
    ? [
        "How many people did we onboard this year, per office?",
        "What does Returned mean?",
        "How is the offboarding SLA counted?",
      ]
    : [
        "How long did approvals take this month?",
        "How many people did we onboard this year?",
        "What does Returned mean?",
      ];
}

export type ChatProblem = {
  kind: "not_configured" | "off" | "budget" | "rate" | "error";
  title: string;
  text: string;
  /** Show "Try again". */
  retry: boolean;
};

/**
 * What /api/chat answered when it didn't answer (board: App help, off-topic,
 * limits): the JSON body `{ error, resetsAt }` arrives as the error message.
 */
export function chatProblem(
  message: string | undefined,
  timeZone?: string,
): ChatProblem {
  let body: { error?: string; resetsAt?: string | null } = {};
  try {
    body = JSON.parse(message ?? "");
  } catch {
    // not JSON: a network or server error
  }
  const when = (
    iso: string | null | undefined,
    opts: Intl.DateTimeFormatOptions,
  ) =>
    iso
      ? new Intl.DateTimeFormat("en-GB", { ...opts, timeZone }).format(
          new Date(iso),
        )
      : null;

  switch (body.error) {
    case "not_configured":
      return {
        kind: "not_configured",
        title: "The assistant isn't set up yet",
        text: "An admin needs to add the Anthropic API key to the server settings.",
        retry: false,
      };
    case "off":
      return {
        kind: "off",
        title: "The assistant is switched off",
        text: "An admin can switch it on in Admin → AI settings.",
        retry: false,
      };
    case "budget": {
      const day = when(body.resetsAt, { day: "numeric", month: "short" });
      return {
        kind: "budget",
        title: "The assistant is paused for this month",
        text: `The monthly budget is used up.${day ? ` It starts again on ${day}` : ""} — or an admin can raise the budget in Admin → AI settings.`,
        retry: false,
      };
    }
    case "rate": {
      const time = when(body.resetsAt, { hour: "2-digit", minute: "2-digit" });
      return {
        kind: "rate",
        title: "Too many questions at once",
        text: `You've reached this hour's limit.${time ? ` Try again at ${time}` : " Try again later"} — your chat is kept.`,
        retry: false,
      };
    }
    default:
      return {
        kind: "error",
        title: "Something went wrong",
        text: "The answer didn't arrive.",
        retry: true,
      };
  }
}

/** A tool call in plain words: "Read the help page Statuses & who acts". */
export function toolStep(name: string, done: boolean, output: unknown): string {
  const field = (key: string) =>
    output && typeof output === "object" && key in output
      ? String((output as Record<string, unknown>)[key])
      : null;
  switch (name) {
    case "getAppHelp":
      return done && field("title")
        ? `Read the help page ${field("title")}`
        : "Reading the help…";
    case "runReport":
      if (!done) return "Running the report…";
      return field("report")
        ? `Ran the report ${field("report")}`
        : "Couldn't run the report";
    default:
      return done ? "Looked it up" : "Looking it up…";
  }
}

/** The report a step used, to open it with the same filters ("/reports/…"). */
export function stepLink(output: unknown): string | null {
  if (!output || typeof output !== "object" || !("link" in output)) return null;
  const link = (output as { link: unknown }).link;
  return typeof link === "string" && link.startsWith("/reports/") ? link : null;
}

const textOf = (m: UIMessage) =>
  m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();

/** The chat ends with a question that has no answer yet. */
export function lastIsQuestion(messages: readonly UIMessage[]): boolean {
  return messages[messages.length - 1]?.role === "user";
}

/**
 * The server finished the answer to this question after the browser lost
 * the connection: the saved chat has the question, then an answer.
 */
export function answeredOnServer(
  saved: readonly UIMessage[],
  question: string,
): boolean {
  const last = saved.findLastIndex((m) => m.role === "user");
  return (
    last >= 0 &&
    textOf(saved[last]) === question.trim() &&
    saved.slice(last + 1).some((m) => m.role === "assistant")
  );
}

/** The newest question in the chat, as typed. */
export function lastQuestion(messages: readonly UIMessage[]): string {
  const last = messages.findLast((m) => m.role === "user");
  return last ? textOf(last) : "";
}
