import type { Role } from "@/lib/auth";

/** The longest question the assistant accepts (characters). */
export const MAX_QUESTION_LENGTH = 4000;

/** "Good morning, Raju." — by the hour on the person's own clock. */
export function greeting(name: string, hour: number): string {
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `Good ${part}, ${name}.`;
}

/**
 * Questions to start with (board: Assistant chat). F15 answers from the
 * help library; report questions join with F15d.
 */
export function starterQuestions(roles: readonly Role[]): string[] {
  const it = roles.some(
    (r) => r === "admin" || r === "requester" || r === "it_operator",
  );
  return it
    ? [
        "What does Returned mean?",
        "How is the offboarding SLA counted?",
        "How do I change someone's access?",
      ]
    : [
        "What does Returned mean?",
        "How do I confirm and sign a request?",
        "What do the reports count?",
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
  const title =
    output && typeof output === "object" && "title" in output
      ? String((output as { title: unknown }).title)
      : null;
  switch (name) {
    case "getAppHelp":
      return done && title
        ? `Read the help page ${title}`
        : "Reading the help…";
    default:
      return done ? "Looked it up" : "Looking it up…";
  }
}
