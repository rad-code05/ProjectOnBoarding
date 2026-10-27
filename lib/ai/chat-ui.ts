import type { UIMessage } from "ai";
import type { Role } from "@/lib/auth";
import { formatDate } from "@/lib/requests/format";
import { zonedParts } from "@/lib/time/zoned";
import { TOPICS, type Topic } from "./tools/onboarding-shared";

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
    case "saveCustomReport": {
      if (!done) return "Building the custom report…";
      if (!field("link")) return "Couldn't build the custom report";
      const parts = Array.isArray((output as { parts?: unknown }).parts)
        ? (output as { parts: unknown[] }).parts.length
        : 0;
      return field("changed") === "true"
        ? "Changed the custom report"
        : `Built a custom report · ${parts} part${parts === 1 ? "" : "s"}`;
    }
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
    case "getFormOptions":
      return done ? "Checked the form's lists" : "Checking the form's lists…";
    case "createOnboardingDraft": {
      if (!done) return "Creating the draft…";
      if (field("created") !== "true")
        return "Didn't create the draft — a few things to check";
      const n = Number(field("suggestions") ?? 0);
      return `Created the draft ${field("ticket") ?? ""} · ${n} suggestion${n === 1 ? "" : "s"} waiting`;
    }
    case "suggestValues": {
      if (!done) return "Adding suggestions…";
      const n = Number(field("added") ?? 0);
      return n > 0
        ? `Added ${n} suggestion${n === 1 ? "" : "s"} to ${field("ticket") ?? "the request"}`
        : "Didn't add anything — a few things to check";
    }
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
  // A custom report (F17a): its own export, also as Excel.
  if (/^\/reports\/custom\/[0-9a-f-]{36}$/.test(link)) {
    const href = `${link}/export`;
    return [
      { label: "CSV", href },
      { label: "PDF", href: `${href}?format=pdf` },
      { label: "Excel", href: `${href}?format=xlsx` },
    ];
  }
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
const REFUSED_LEAD =
  "I can't help with that request. I only answer questions about this app and its data: reports, people and access, requests, and how the app works.";
export const REFUSED_ANSWER = `${REFUSED_LEAD} If this was a normal question, please ask it again in other words.`;

/**
 * A refused answer: our fixed words, or empty (refusals saved before they
 * had words). Its question is never sent to the model again — the safety
 * filter reads the whole chat, so an old attack would get the next,
 * harmless question refused too.
 */
export function isRefused(message: UIMessage): boolean {
  if (message.role !== "assistant") return false;
  const text = textOf(message);
  if (text) return text.startsWith(REFUSED_LEAD);
  return !message.parts.some((p) => p.type.startsWith("tool-"));
}

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

/** The Confirm card for a write the assistant asks to do (F16c). */
export type ConfirmCard = {
  title: string;
  rows: { label: string; value: string }[];
  note: string;
  yes: string;
};

type Named = {
  name?: unknown;
  type?: unknown;
  permission?: unknown;
  description?: unknown;
  scope?: unknown;
};
const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const listOf = (v: unknown, show: (x: Named) => string | null) =>
  Array.isArray(v)
    ? v
        .map((x) => (x && typeof x === "object" ? show(x as Named) : null))
        .filter(Boolean)
        .join(", ")
    : "";

/**
 * What the person is asked to confirm, in words — from the tool's input
 * (board *Confirm creates the draft*). null = not a write we know.
 */
export function confirmCard(tool: string, input: unknown): ConfirmCard | null {
  if (tool !== "createOnboardingDraft" || !input || typeof input !== "object")
    return null;
  const i = input as Record<string, unknown>;
  const name = [str(i.firstName), str(i.lastName)].filter(Boolean).join(" ");
  const rows = [
    {
      label: "Employee",
      value: [name, str(i.workEmail)].filter(Boolean).join(" · "),
    },
    {
      label: "Job",
      value: [str(i.jobTitle), str(i.department)].filter(Boolean).join(" · "),
    },
    { label: "Manager", value: str(i.manager) ?? "" },
    {
      label: "Office",
      value: [str(i.office), str(i.city), str(i.state)]
        .filter(Boolean)
        .join(" · "),
    },
    {
      label: "Start date",
      value: str(i.startDate) ? formatDate(str(i.startDate)) : "",
    },
    {
      label: "Nationality",
      value: Array.isArray(i.nationalities) ? i.nationalities.join(", ") : "",
    },
    {
      label: "Applications",
      value: listOf(
        i.applications,
        (a) =>
          [str(a.name), str(a.permission)].filter(Boolean).join(" · ") || null,
      ),
    },
    {
      label: "Equipment",
      value: listOf(
        i.equipment,
        (e) =>
          [str(e.type), str(e.description)].filter(Boolean).join(" · ") || null,
      ),
    },
    {
      label: "Access",
      value: listOf(
        i.access,
        (a) => [str(a.type), str(a.scope)].filter(Boolean).join(" · ") || null,
      ),
    },
    {
      label: "Not needed",
      value: Array.isArray(i.notNeeded)
        ? i.notNeeded
            .map((t) => TOPICS[t as Topic])
            .filter(Boolean)
            .join(", ")
        : "",
    },
  ].filter((r) => r.value);
  return {
    title: `Create a draft onboarding for ${name || "this person"}?`,
    rows,
    note: "Creates a draft only. Every value arrives on the form as a suggestion you accept. Nothing is sent to the tools; you still do the IT work, tick section 9 and Review & sign.",
    yes: "Confirm — create the draft",
  };
}

/** The approval the person just answered (what a Confirm sends), if any. */
export function answeredApproval(
  message: UIMessage | undefined,
): { id: string; approved: boolean } | null {
  if (message?.role !== "assistant") return null;
  for (const part of [...message.parts].reverse()) {
    if (
      "state" in part &&
      part.state === "approval-responded" &&
      "approval" in part &&
      part.approval
    ) {
      const a = part.approval as { id: string; approved: boolean };
      return { id: a.id, approved: a.approved };
    }
  }
  return null;
}
