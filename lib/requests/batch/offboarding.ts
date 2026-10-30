import {
  leaverMatches,
  MAILBOX_WORDS,
  offboardingFields,
  type MailboxChoice,
  type RemovalMethod,
} from "@/lib/ai/tools/offboarding-shared";
import type { Leaver } from "@/lib/requests/leavers-shared";
import { TIMELINE_LABELS, type SlaTimeline } from "@/lib/requests/offboarding";
import { readDay, type BatchWrite, type Problem } from "./onboarding";

/**
 * Batch of leavers (F17b-5a, pure): one row of the list — the cells by
 * field (`BATCH_FIELDS.offboarding`) — plus "the same for everyone" (the
 * batch's defaults: SLA, cut-off time, handover, removal method, mailbox),
 * which a row's own cell overrides. Each leaver is found among the people
 * who hold something today, never guessed; the removals are pre-filled by
 * the database from what they hold. The writes are the robot's own
 * (`offboardingFields`) plus the removal method for every application.
 */

/** "The same for everyone" — stored on the batch (`request_batches.settings`). */
export type LeaverDefaults = {
  slaTimeline?: SlaTimeline;
  /** "18:00", company time. */
  cutoffTime?: string;
  handoverTo?: string;
  removalMethod?: RemovalMethod;
  mailbox?: MailboxChoice;
};

export type LeaverContext = {
  /** Everyone who holds something today (`listLeavers`). */
  leavers: Leaver[];
  /** Today in the company timezone, YYYY-MM-DD. */
  today: string;
  timeZone: string;
};

export type CheckedLeaver = {
  writes: BatchWrite[];
  problems: Problem[];
  /** The person found (null while unclear). */
  employeeId: string | null;
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** "Same day", "24h", "Within 48 hours" → the SLA; null otherwise. */
export function readTimeline(text: string | undefined): SlaTimeline | null {
  const t = squash(text ?? "");
  if (!t) return null;
  if (t === "sameday" || t === "0" || t === "today") return "same_day";
  if (/^(within)?24(h|hrs?|hours?)?$/.test(t)) return "within_24h";
  if (/^(within)?48(h|hrs?|hours?)?$/.test(t)) return "within_48h";
  return null;
}

/** "18:00", "9.30", "18:00:00", "6 pm", "6:30pm" → "HH:MM"; null otherwise. */
export function readTime(text: string | undefined): string | null {
  const t = (text ?? "").trim().toLowerCase();
  const m = t.match(/^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(am|pm)?$/);
  if (!m || (!m[2] && !m[3])) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === "pm" ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "delete", "Suspend" … → the method; null otherwise. */
export function readMethod(text: string | undefined): RemovalMethod | null {
  const t = squash(text ?? "");
  return t === "delete"
    ? "Delete"
    : t === "suspend"
      ? "Suspend"
      : t === "disable"
        ? "Disable"
        : null;
}

/** "Convert to shared", "Shared" → converted; "No", "None", "No mailbox" → none. */
export function readMailbox(text: string | undefined): MailboxChoice | null {
  const t = squash(text ?? "");
  if (!t) return null;
  if (t.includes("shared") || t.startsWith("convert"))
    return "converted_shared";
  if (/^(no|none|na|nomailbox|nomailboxtoconvert)$/.test(t))
    return "no_mailbox";
  return null;
}

/** The batch's defaults as saved (anything unreadable is dropped). */
export function readDefaults(raw: unknown): LeaverDefaults {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const str = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  const out: LeaverDefaults = {};
  const sla = readTimeline(str("slaTimeline"));
  if (sla) out.slaTimeline = sla;
  const time = readTime(str("cutoffTime"));
  if (time) out.cutoffTime = time;
  const handover = str("handoverTo").trim().slice(0, 500);
  if (handover) out.handoverTo = handover;
  const method = readMethod(str("removalMethod"));
  if (method) out.removalMethod = method;
  const mailbox = readMailbox(str("mailbox"));
  if (mailbox) out.mailbox = mailbox;
  return out;
}

const fromDefaults = (label: string) =>
  `${label} missing — fill it in for this row or in "Same for everyone"`;

/** One leaver on their own (the same person twice is `checkLeaverBatch`). */
export function checkLeaverRow(
  values: Record<string, string>,
  defaults: LeaverDefaults,
  ctx: LeaverContext,
): CheckedLeaver {
  const problems: Problem[] = [];
  const add = (field: string, message: string) =>
    problems.push({ field, message });

  // The person: among those who hold something today, never guessed.
  let employeeId: string | null = null;
  const person = values.person?.trim() ?? "";
  if (!person) add("person", "Name or work email missing — required");
  else {
    const matches = leaverMatches(ctx.leavers, person);
    if (matches.length === 0)
      add(
        "person",
        `Nobody called "${person}" holds anything in the app — an offboarding starts from what the person holds`,
      );
    else if (matches.length > 1)
      add(
        "person",
        `${matches.length} people match — write the work email: ${matches
          .slice(0, 5)
          .map((l) => `${l.name} (${l.email})`)
          .join(", ")}`,
      );
    else if (matches[0].openTicket)
      add("person", `Already leaving · ${matches[0].openTicket}`);
    else employeeId = matches[0].id;
  }

  // Dates: written like the onboarding list, never in the past.
  const day = (field: string, label: string, required: boolean) => {
    const cell = values[field]?.trim();
    if (!cell) {
      if (required) add(field, `${label} missing — required`);
      return undefined;
    }
    const d = readDay(cell);
    if (!d)
      add(
        field,
        `"${cell}" isn't a date — write it like 2026-11-02 or 02/11/2026`,
      );
    else if (d < ctx.today)
      add(field, "In the past — dates are never backdated");
    else return d;
    return undefined;
  };
  const lastWorkingDay = day("lastWorkingDay", "Last working day", true);
  // The cut-off is on the last working day unless the row says otherwise.
  const cutoffDate = values.cutoffDate?.trim()
    ? day("cutoffDate", "Cut-off date", false)
    : lastWorkingDay;

  // A row's own cell wins; an unreadable one is a problem (not the default).
  const pick = <T>(
    field: keyof LeaverDefaults,
    label: string,
    read: (t: string) => T | null,
    example: string,
  ): T | undefined => {
    const cell = values[field]?.trim();
    if (cell) {
      const v = read(cell);
      if (v === null) add(field, `"${cell}" isn't ${example}`);
      return v ?? undefined;
    }
    const d = defaults[field] as T | undefined;
    if (d === undefined) add(field, fromDefaults(label));
    return d;
  };
  const slaTimeline = pick<SlaTimeline>(
    "slaTimeline",
    "SLA",
    readTimeline,
    `an SLA — ${Object.values(TIMELINE_LABELS).join(", ")}`,
  );
  const cutoffTime = pick(
    "cutoffTime",
    "Cut-off time",
    readTime,
    "a time like 18:00",
  );
  const handoverTo = pick(
    "handoverTo",
    "Handover",
    (t) => t.slice(0, 500),
    "a handover",
  );
  const removalMethod = pick(
    "removalMethod",
    "Removal method",
    readMethod,
    "a removal method — Delete, Suspend or Disable",
  );
  const mailbox = pick(
    "mailbox",
    "Mailbox",
    readMailbox,
    `a mailbox choice — ${Object.values(MAILBOX_WORDS).join(" or ")}`,
  );

  // Every value is checked above, so the robot's helper only builds the
  // writes (the cut-off once both its parts read).
  const cutoff = cutoffDate && cutoffTime;
  const fields = offboardingFields(
    {
      lastWorkingDay,
      slaTimeline,
      cutoffDate: cutoff ? cutoffDate : undefined,
      cutoffTime: cutoff ? cutoffTime : undefined,
      handoverTo,
      mailbox,
    },
    ctx.timeZone,
  );
  const writes: BatchWrite[] = fields.suggestions;
  if (removalMethod)
    writes.push({
      kind: "removal_all",
      target: "removal_all",
      value: { method: removalMethod },
    });
  return { writes, problems, employeeId };
}

/** Every row, plus the same person twice in the list (the later rows flagged). */
export function checkLeaverBatch(
  rows: { position: number; values: Record<string, string> }[],
  defaults: LeaverDefaults,
  ctx: LeaverContext,
): Map<number, CheckedLeaver> {
  const out = new Map<number, CheckedLeaver>();
  const seen = new Map<string, number>();
  for (const row of [...rows].sort((a, b) => a.position - b.position)) {
    const checked = checkLeaverRow(row.values, defaults, ctx);
    if (checked.employeeId) {
      const first = seen.get(checked.employeeId);
      if (first !== undefined) {
        checked.problems.push({
          field: "person",
          message: `The same person as row ${first}`,
        });
      } else seen.set(checked.employeeId, row.position);
    }
    out.set(row.position, checked);
  }
  return out;
}
