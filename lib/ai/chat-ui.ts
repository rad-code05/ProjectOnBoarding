import type { UIMessage } from "ai";
import type { Role } from "@/lib/auth";
import { zonedParts } from "@/lib/time/zoned";

/** The longest question the assistant accepts (characters). */
export const MAX_QUESTION_LENGTH = 4000;

/** "Good morning, Raju." — by the hour on the person's own clock. */
export function greeting(name: string, hour: number): string {
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `Good ${part}, ${name}.`;
}

/**
 * Questions to start with (board: Assistant chat): one report question, one
 * about people & access (IT) or approving (approvers), one about the app.
 */
export function starterQuestions(roles: readonly Role[]): string[] {
  const it = roles.some(
    (r) => r === "admin" || r === "requester" || r === "it_operator",
  );
  return it
    ? [
        "How many people did we onboard this year, per office?",
        "Who has Admin rights in any application?",
        "What does Returned mean?",
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

/**
 * A tool call in plain words: "Read the help page Statuses & who acts".
 * Empty = not shown (saving a question to memory is housekeeping).
 */
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
    case "nationalityBreakdown":
      return done && field("people") !== null
        ? `Counted nationalities (${field("who")})`
        : done
          ? "Couldn't count the nationalities"
          : "Counting nationalities…";
    case "searchPeople":
      return done
        ? `Searched people for “${field("query")}”`
        : "Searching people…";
    case "getPersonAccess":
      if (!done) return "Looking up what they hold…";
      return field("email")
        ? `Looked up what ${field("person")} holds`
        : "Couldn't find that person";
    case "whoHasAccess":
      return done
        ? `Looked up who holds ${field("asked")}`
        : "Looking up who holds it…";
    case "getCatalog":
      return done ? "Read the catalog" : "Reading the catalog…";
    case "rememberPreference":
      return done && field("saved") ? "Saved to your memory" : "";
    case "rememberQuestion":
      return "";
    case "listRequests":
      return done
        ? "Looked through the requests"
        : "Looking through the requests…";
    case "getRequest":
      if (!done) return "Opening the request…";
      return field("status")
        ? `Read the request ${field("ticket")}`
        : "Couldn't find that request";
    default:
      return done ? "Looked it up" : "Looking it up…";
  }
}

/**
 * Where a step's result opens in the app: the report with the same filters
 * ("/reports/…") or the request ("/requests/<id>", "/records/<id>").
 * Only our own pages — never a link the model could make up.
 */
export function stepLink(output: unknown): string | null {
  if (!output || typeof output !== "object" || !("link" in output)) return null;
  const link = (output as { link: unknown }).link;
  if (typeof link !== "string") return null;
  return link.startsWith("/reports/") ||
    /^\/(requests|records)\/[0-9a-f-]{36}$/.test(link)
    ? link
    : null;
}

/**
 * A closed request's PDF record ("/records/<id>/pdf"), offered under the
 * answer as "Download the PDF" — the same audited download as the record page.
 */
export function stepPdfLink(output: unknown): string | null {
  if (!output || typeof output !== "object" || !("pdfLink" in output)) {
    return null;
  }
  const link = (output as { pdfLink: unknown }).pdfLink;
  return typeof link === "string" &&
    /^\/records\/[0-9a-f-]{36}\/pdf$/.test(link)
    ? link
    : null;
}

/**
 * A report step's downloads (Raju, 2026-10-24: "okay then csv"): the
 * report's own export route with the same filters — the audited download
 * of the report page. "/reports/x?a=1" → "/reports/x/export?a=1" (+ PDF);
 * one application's holders export through Access by application.
 */
export function stepDownloads(
  output: unknown,
): { label: string; href: string }[] {
  const link = stepLink(output);
  if (!link?.startsWith("/reports/")) return [];
  const [path, query = ""] = link.split("?");
  const base = path.replace(/\/holders$/, "");
  if (!/^\/reports\/[a-z-]+$/.test(base)) return [];
  const csv = `${base}/export${query ? `?${query}` : ""}`;
  return [
    { label: "Download CSV", href: csv },
    { label: "PDF", href: `${csv}${query ? "&" : "?"}format=pdf` },
  ];
}

/** The words on a step's link. */
export function stepLinkLabel(href: string): string {
  return href.startsWith("/reports/") ? "Open the report" : "Open the request";
}

const textOf = (m: UIMessage) =>
  m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();

/**
 * What the robot says when the model's safety filter stopped the answer
 * before a word was written (finish reason "content-filter").
 */
export const REFUSED_ANSWER =
  "I can't help with that request. I only answer questions about this app and its data: reports, people and access, requests, and how the app works.";

/**
 * A refused answer arrives empty: give it the fixed words, so the chat shows
 * them, they are saved, and the next question doesn't send an empty answer.
 */
export function withRefusedText(message: UIMessage): UIMessage {
  if (message.role !== "assistant" || textOf(message)) return message;
  return {
    ...message,
    parts: [...message.parts, { type: "text", text: REFUSED_ANSWER }],
  };
}

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

/** One of the person's own chats in Previous chats. */
export type ChatSummary = {
  id: string;
  /** The first question (chatTitle). */
  title: string;
  /** The last message's server time. */
  updatedAt: string;
  messages: number;
};

export type ChatGroup = {
  label: "Today" | "This week" | "Older";
  chats: (ChatSummary & { when: string })[];
};

/**
 * Previous chats grouped like the board: Today ("14:42"), This week
 * (Monday on; "Tue 21 Oct"), Older ("2 Oct 2026") — on the person's clock.
 */
export function chatGroups(
  chats: readonly ChatSummary[],
  timeZone: string,
  now = new Date(),
): ChatGroup[] {
  const today = zonedParts(now.toISOString(), timeZone).date;
  const monday = new Date(`${today}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const weekStart = monday.toISOString().slice(0, 10);
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...opts, timeZone }).format(
      new Date(iso),
    );
  const groups: ChatGroup[] = [
    { label: "Today", chats: [] },
    { label: "This week", chats: [] },
    { label: "Older", chats: [] },
  ];
  for (const chat of chats) {
    const day = zonedParts(chat.updatedAt, timeZone).date;
    if (day === today) {
      groups[0].chats.push({
        ...chat,
        when: fmt(chat.updatedAt, { hour: "2-digit", minute: "2-digit" }),
      });
    } else if (day >= weekStart) {
      groups[1].chats.push({
        ...chat,
        when: fmt(chat.updatedAt, {
          weekday: "short",
          day: "numeric",
          month: "short",
        }),
      });
    } else {
      groups[2].chats.push({
        ...chat,
        when: fmt(chat.updatedAt, {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      });
    }
  }
  return groups.filter((g) => g.chats.length > 0);
}
