import { formatDate, formatDayTime } from "@/lib/requests/format";
import type { RequestType } from "@/lib/requests/labels";
import {
  formatDuration,
  TIMELINE_LABELS,
  type SlaTimeline,
} from "@/lib/requests/offboarding";
import { SECTIONS } from "@/lib/requests/sections";

/**
 * The six notification emails + the admin's test email (F23, board *Email
 * notifications*): black header, one line, the facts, one button that opens
 * the app. Never roles, access details or signatures — a return comment only
 * as a short excerpt. Pure: the sender (F23b-3) loads the facts.
 */
export type EmailKind =
  | "waiting"
  | "reminder"
  | "returned"
  | "closed"
  | "sla_due"
  | "sla_missed"
  | "test";

export type EmailFacts = {
  kind: EmailKind;
  request: {
    id: string;
    ticket: string;
    type: RequestType;
    firstName: string | null;
    lastName: string | null;
    /** Onboarding / access change: the effective date ("2026-11-02"). */
    effectiveDate: string | null;
    /** Offboarding: the last working day. */
    lastWorkingDay: string | null;
    /** Since when it waits for confirmation (reminders). */
    waitingSince: string | null;
  } | null;
  /** Who signed section 9, and when. */
  itSigner: { name: string; signedAt: string } | null;
  /** The approver's return or confirmation. */
  decision: {
    by: string;
    at: string;
    comment: string | null;
    flagged: number[];
  } | null;
  /** Closed: the PDF record's file name. */
  pdfFileName: string | null;
  /** Offboarding SLA (sla_due / sla_missed). */
  sla: {
    dueAt: string;
    timeline: SlaTimeline | null;
    done: number;
    total: number;
    devicesPending: number;
  } | null;
};

export type RenderedEmail = { subject: string; html: string; text: string };

type Content = {
  subject: string;
  title: string;
  body: string;
  facts: string[];
  cta: string;
  path: string;
};

const TYPE_WORDS: Record<RequestType, string> = {
  onboarding: "onboarding",
  offboarding: "offboarding",
  access_modification: "access change",
};

const FOOTER =
  "Laine onboarding rights · internal system. No personal details beyond the name are included; sign in to see the request.";

const DAY_MS = 86_400_000;

/** "Anna Keller", or the ticket when the name is still empty. */
function personName(request: NonNullable<EmailFacts["request"]>): string {
  const name = [request.firstName, request.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || request.ticket;
}

/** The approver's first word: "Moises Larez" → "Moises". */
function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** A return comment as a short quote: one line, at most 120 characters. */
export function commentExcerpt(comment: string, max = 120): string {
  const line = comment.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}

/** [5, 9] → "Application access, IT execution confirmation". */
function sectionNames(numbers: number[]): string {
  return [...numbers]
    .sort((a, b) => a - b)
    .map((n) => SECTIONS.find((s) => s.number === n)?.title ?? `Section ${n}`)
    .join(", ");
}

/** "UAM-2026-000124 · Onboarding · effective 2 Nov 2026" */
function requestLine(request: NonNullable<EmailFacts["request"]>): string {
  const type = TYPE_WORDS[request.type];
  const parts = [request.ticket, type[0].toUpperCase() + type.slice(1)];
  if (request.type === "offboarding" && request.lastWorkingDay) {
    parts.push(`last working day ${formatDate(request.lastWorkingDay)}`);
  } else if (request.type !== "offboarding" && request.effectiveDate) {
    parts.push(`effective ${formatDate(request.effectiveDate)}`);
  }
  return parts.join(" · ");
}

/** "5 of 11 removed · 1 device return pending" */
function removalLine(sla: NonNullable<EmailFacts["sla"]>): string {
  const parts = [`${sla.done} of ${sla.total} removed`];
  if (sla.devicesPending > 0) {
    parts.push(
      `${sla.devicesPending} device return${sla.devicesPending === 1 ? "" : "s"} pending`,
    );
  }
  return parts.join(" · ");
}

function need<T>(value: T | null, what: string, kind: EmailKind): T {
  if (value === null) throw new Error(`${kind} email without ${what}`);
  return value;
}

/** What each email says (wording from the approved board). */
export function emailContent(
  facts: EmailFacts,
  timeZone: string,
  now: Date = new Date(),
): Content {
  const { kind } = facts;
  if (kind === "test") {
    return {
      subject: "Test email from Laine onboarding rights",
      title: "Your notification emails work",
      body: "You asked for this test email in Admin → Notifications. Requests now reach people by email.",
      facts: [`Sent ${formatDayTime(now.toISOString(), timeZone)}`],
      cta: "Open Notifications",
      path: "/admin/notifications",
    };
  }

  const request = need(facts.request, "a request", kind);
  const name = personName(request);
  const type = TYPE_WORDS[request.type];

  switch (kind) {
    case "waiting": {
      const signer = need(facts.itSigner, "the IT signer", kind);
      return {
        subject: `Waiting for your confirmation: ${name}`,
        title: "A request is waiting for you",
        body: `${signer.name} completed and signed the ${type} for ${name}. Please review and confirm — the first approver to confirm closes it.`,
        facts: [requestLine(request)],
        cta: "Review & confirm",
        path: `/approvals/${request.id}`,
      };
    }
    case "reminder": {
      const since = request.waitingSince ?? facts.itSigner?.signedAt ?? null;
      const days = since
        ? Math.max(1, Math.floor((now.getTime() - Date.parse(since)) / DAY_MS))
        : null;
      const waited =
        days === null ? "" : ` ${days} day${days === 1 ? "" : "s"}`;
      return {
        subject: `Reminder — waiting${waited}: ${name}`,
        title: "Still waiting for your confirmation",
        body: `The ${type} for ${name} has waited${waited || " for a while"}. One reminder a day until someone confirms or returns it.`,
        facts: [
          facts.itSigner
            ? `${request.ticket} · signed by IT ${formatDayTime(facts.itSigner.signedAt, timeZone)}`
            : request.ticket,
        ],
        cta: "Review & confirm",
        path: `/approvals/${request.id}`,
      };
    }
    case "returned": {
      const decision = need(facts.decision, "the return", kind);
      const by = firstWord(decision.by);
      const lines: string[] = [];
      if (decision.comment?.trim()) {
        lines.push(`“${commentExcerpt(decision.comment)}”`);
      }
      if (decision.flagged.length > 0) {
        lines.push(`flagged: ${sectionNames(decision.flagged)}`);
      }
      return {
        subject: `Returned by ${by}: ${name}`,
        title: `${by} returned a request`,
        body: `${by} left a comment on the ${type} for ${name}. Fix it and sign again.`,
        facts: [lines.length ? lines.join(" · ") : request.ticket],
        cta: "Open request",
        path: `/requests/${request.id}`,
      };
    }
    case "closed": {
      const decision = need(facts.decision, "the confirmation", kind);
      const parts = [
        request.ticket,
        `closed ${formatDayTime(decision.at, timeZone)}`,
      ];
      if (facts.pdfFileName) parts.push(facts.pdfFileName);
      return {
        subject: `Closed — PDF ready: ${name}`,
        title: "Confirmed, signed and closed",
        body: `${firstWord(decision.by)} confirmed the ${type} for ${name}. The PDF record is ready.`,
        facts: [parts.join(" · ")],
        cta: "Open the record",
        path: `/records/${request.id}`,
      };
    }
    case "sla_due": {
      const sla = need(facts.sla, "the SLA", kind);
      const left = formatDuration(Date.parse(sla.dueAt) - now.getTime());
      const rule = sla.timeline
        ? ` (${TIMELINE_LABELS[sla.timeline].toLowerCase()})`
        : "";
      return {
        subject: `SLA due in ${left}: ${name} offboarding`,
        title: `Access removal due in ${left}`,
        body: `The offboarding for ${name} must be completed by ${formatDayTime(sla.dueAt, timeZone)}${rule}.`,
        facts: [removalLine(sla)],
        cta: "Open offboarding",
        path: `/requests/${request.id}`,
      };
    }
    case "sla_missed": {
      const sla = need(facts.sla, "the SLA", kind);
      const late = formatDuration(now.getTime() - Date.parse(sla.dueAt));
      return {
        subject: `SLA missed: ${name} offboarding`,
        title: "The removal deadline has passed",
        body: `The offboarding for ${name} was due ${formatDayTime(sla.dueAt, timeZone)} and is not finished. Finish the removals and add the reason it was late.`,
        facts: [`${removalLine(sla)} · overdue by ${late}`],
        cta: "Open offboarding",
        path: `/requests/${request.id}`,
      };
    }
  }
}

/** Text for HTML: & < > " ' escaped. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const FONT = "Raleway, Helvetica, Arial, sans-serif";
const HEADING = "Newsreader, Georgia, 'Times New Roman', serif";

/**
 * The finished email: subject, HTML (tables + inline styles, as mail apps
 * need) and a plain-text copy. `baseUrl` = the site the button opens.
 */
export function renderEmail(
  facts: EmailFacts,
  options: { baseUrl: string; timeZone: string; now?: Date },
): RenderedEmail {
  const content = emailContent(facts, options.timeZone, options.now);
  const url = `${options.baseUrl.replace(/\/+$/, "")}${content.path}`;
  const logo = `${options.baseUrl.replace(/\/+$/, "")}/brand/laine-logo-white.png`;
  const e = escapeHtml;

  const factLines = content.facts
    .map(
      (line) =>
        `<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#535353">${e(line)}</p>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(content.subject)}</title></head>
<body style="margin:0;padding:0;background:#F4F0EA">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F0EA">
<tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2dccf">
<tr><td style="background:#000000;padding:18px 24px">
<img src="${e(logo)}" alt="Laine" height="22" style="display:inline-block;height:22px;border:0;vertical-align:middle">
<span style="font-family:${FONT};font-size:13px;color:#7e7e7e;vertical-align:middle;padding-left:10px">onboarding rights</span>
</td></tr>
<tr><td style="padding:28px 24px 8px;font-family:${FONT};color:#000000">
<h1 style="margin:0 0 12px;font-family:${HEADING};font-size:24px;font-weight:500;line-height:1.25">${e(content.title)}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.55">${e(content.body)}</p>
${factLines}
</td></tr>
<tr><td style="padding:16px 24px 28px">
<a href="${e(url)}" style="display:inline-block;background:#000000;color:#ffffff;font-family:${FONT};font-size:14px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:999px">${e(content.cta)}</a>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e2dccf;font-family:${FONT};font-size:12px;line-height:1.5;color:#535353">${e(FOOTER)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    content.title,
    "",
    content.body,
    "",
    ...content.facts,
    "",
    `${content.cta}: ${url}`,
    "",
    "—",
    FOOTER,
  ].join("\n");

  return { subject: content.subject, html, text };
}
