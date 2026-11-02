import type { SendMode } from "@/lib/notifications/policy";
import { personName } from "@/lib/requests/labels";

/**
 * Admin → Notifications (F23c, board Phone · Admin · Notifications): the
 * words of the page. Pure — the loader reads the rows.
 */
export const EMAIL_SWITCHES = [
  "waiting",
  "reminder",
  "returned",
  "closed",
  "sla_due",
  "sla_missed",
] as const;
export type EmailSwitch = (typeof EMAIL_SWITCHES)[number];
export type EmailSwitches = Record<EmailSwitch, boolean>;

export function switchWords(
  kind: EmailSwitch,
  settings: { reminderAfterDays: number; slaWarnHours: number },
): { name: string; when: string } {
  const days = settings.reminderAfterDays;
  const hours = settings.slaWarnHours;
  switch (kind) {
    case "waiting":
      return {
        name: "Waiting for approval",
        when: "To every approver, when IT signs a request (and after a fix).",
      };
    case "reminder":
      return {
        name: "Reminder to approvers",
        when: `Daily after ${days === 1 ? "1 day" : `${days} days`} of waiting.`,
      };
    case "returned":
      return {
        name: "Returned",
        when: "To the IT signer, with a short excerpt of the comment.",
      };
    case "closed":
      return {
        name: "Closed — PDF ready",
        when: "To the IT signer, when an approver confirms.",
      };
    case "sla_due":
      return {
        name: "SLA due soon",
        when: `To IT, ${hours === 1 ? "1 hour" : `${hours} hours`} before an offboarding deadline.`,
      };
    case "sla_missed":
      return {
        name: "SLA missed",
        when: "To IT, when the deadline passes unfinished.",
      };
  }
}

/** The Sender card: is this site sending, and to whom? */
export function senderStatus(mode: SendMode): {
  headline: string;
  line: string;
  connected: boolean;
} {
  switch (mode.mode) {
    case "everyone":
      return {
        headline: "Connected",
        line: "Emails are sent within a few minutes",
        connected: true,
      };
    case "test_accounts":
      return {
        headline: "Test site",
        line: "Only the test accounts get emails",
        connected: true,
      };
    case "off":
      return mode.reason.startsWith("Preview")
        ? {
            headline: "Preview site",
            line: "This site never sends emails",
            connected: false,
          }
        : {
            headline: "Not connected yet",
            line: "Emails wait in the outbox",
            connected: false,
          };
  }
}

/** One outbox row as the page reads it (admins may read the outbox). */
export type OutboxRow = {
  id: number;
  kind: string;
  requestId: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
  to: string;
  person: { firstName: string | null; lastName: string | null } | null;
};

export type RecentEmail = {
  key: string;
  subject: string;
  to: string;
  at: string;
  status: "Sent" | "Waiting" | "Failed" | "Skipped";
  /** Why it failed / was skipped, or how many tries so far. */
  note: string | null;
};

const TRIES = 3;

function subject(kind: string, name: string): string {
  switch (kind) {
    case "waiting":
      return `Waiting for your confirmation: ${name}`;
    case "reminder":
      return `Reminder — waiting: ${name}`;
    case "returned":
      return `Returned: ${name}`;
    case "closed":
      return `Closed — PDF ready: ${name}`;
    case "sla_due":
      return `SLA due soon: ${name} offboarding`;
    case "sla_missed":
      return `SLA missed: ${name} offboarding`;
    default:
      return "Test email";
  }
}

function status(row: OutboxRow): Pick<RecentEmail, "status" | "note"> {
  switch (row.status) {
    case "sent":
      return { status: "Sent", note: null };
    case "failed":
      return { status: "Failed", note: row.lastError };
    case "skipped":
      return { status: "Skipped", note: row.lastError };
    default:
      return {
        status: "Waiting",
        note:
          row.attempts > 0 && row.lastError
            ? `Tried ${row.attempts} of ${TRIES}: ${row.lastError}`
            : null,
      };
  }
}

/**
 * Newest first; the same email to several people (one database action, one
 * time stamp, same status) is one line: "To Moises Larez, Celine Example".
 */
export function recentEmails(rows: OutboxRow[]): RecentEmail[] {
  const lines = new Map<string, RecentEmail & { names: string[] }>();
  for (const row of rows) {
    const s = status(row);
    const key = [row.kind, row.requestId ?? "", row.createdAt, s.status].join(
      "|",
    );
    const line = lines.get(key);
    if (line) {
      if (!line.names.includes(row.to)) line.names.push(row.to);
      continue;
    }
    const name =
      personName(row.person?.firstName, row.person?.lastName) || "a person";
    lines.set(key, {
      key: `${row.id}`,
      subject: subject(row.kind, name),
      to: "",
      at: row.sentAt ?? row.createdAt,
      ...s,
      names: [row.to],
    });
  }
  return [...lines.values()]
    .map(({ names, ...line }) => ({ ...line, to: names.join(", ") }))
    .sort((a, b) => b.at.localeCompare(a.at));
}
