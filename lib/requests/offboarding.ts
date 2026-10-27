import { zonedToIso } from "@/lib/time/zoned";

/**
 * Offboarding (F09) pieces shared by the server and the screens: section 8
 * timelines, the deadline rule (the database has the last word — this is the
 * preview), and what an offboarding draft lists to remove.
 */
export type SlaTimeline = "same_day" | "within_24h" | "within_48h";

export const TIMELINE_LABELS: Record<SlaTimeline, string> = {
  same_day: "Same day",
  within_24h: "Within 24h",
  within_48h: "Within 48h",
};

export const TIMELINE_RULES: Record<SlaTimeline, string> = {
  same_day: "End of the cut-off day (23:59)",
  within_24h: "Cut-off + 24 hours",
  within_48h: "Cut-off + 48 hours",
};

/**
 * The deadline, as private.sla_deadline() works it out: Same day = 23:59:59
 * of the cut-off day in the company timezone; 24h / 48h after the cut-off.
 * null until timeline, date and time are all set.
 */
export function slaDeadline(
  timeline: string,
  cutoffDate: string,
  cutoffTime: string,
  timeZone: string,
): string | null {
  if (!timeline || !cutoffDate || !/^\d{2}:\d{2}$/.test(cutoffTime))
    return null;
  if (timeline === "same_day") {
    const end = new Date(zonedToIso(cutoffDate, "23:59", timeZone));
    return new Date(end.getTime() + 59_000).toISOString();
  }
  const hours =
    timeline === "within_24h" ? 24 : timeline === "within_48h" ? 48 : null;
  if (hours === null) return null;
  const cutoff = new Date(zonedToIso(cutoffDate, cutoffTime, timeZone));
  return new Date(cutoff.getTime() + hours * 3_600_000).toISOString();
}

/** What an offboarding lists in sections 5–7 (pre-filled from the inventory). */
export type RemovalMethod = "Delete" | "Suspend" | "Disable";
export const REMOVAL_METHODS: RemovalMethod[] = [
  "Delete",
  "Suspend",
  "Disable",
];

export type ReturnStatus = "pending" | "received" | "not_returned";
export const RETURN_LABELS: Record<ReturnStatus, string> = {
  pending: "Return pending",
  received: "Received",
  not_returned: "Not returned",
};

export type MailboxHandling = "converted_shared" | "no_mailbox";
export const MAILBOX_LABELS: Record<MailboxHandling, string> = {
  converted_shared: "Mailbox converted to a shared mailbox",
  no_mailbox: "No mailbox to convert",
};

/** What an offboarding lists in sections 5–7, and the work recorded on them (F09d). */
export type Removals = {
  apps: {
    id: string;
    /** Catalog app, or null for an "Other" app typed on the request. */
    appId: number | null;
    name: string;
    category: string;
    had: string | null;
    method: RemovalMethod | null;
    /** When it was ticked (server time), or null. */
    doneAt: string | null;
  }[];
  equipment: {
    id: string;
    name: string;
    assetTag: string | null;
    description: string | null;
    status: ReturnStatus;
    reason: string | null;
    recordedAt: string | null;
  }[];
  access: {
    id: string;
    typeId: number;
    name: string;
    action: string;
    scope: string | null;
    doneAt: string | null;
    /** Instead of the tick: why it's not removed yet / how it will be. */
    notes: string | null;
  }[];
};

/** Applications + access ticked, of all (equipment is outside the SLA). */
export function removalProgress(removals: Removals): {
  done: number;
  total: number;
} {
  const rows = [...removals.apps, ...removals.access];
  return { done: rows.filter((row) => row.doneAt).length, total: rows.length };
}

/** "7 applications, 1 device and 3 access types" */
export function removalsSummary(removals: Removals): string {
  const n = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  return [
    n(removals.apps.length, "application", "applications"),
    n(removals.equipment.length, "device", "devices"),
    n(removals.access.length, "access type", "access types"),
  ]
    .join(", ")
    .replace(/, ([^,]*)$/, " and $1");
}

/** request_sla() as the screens use it. */
export type SlaResult = {
  total: number;
  done: number;
  /** Time of the last removal, once all are ticked. */
  removedAt: string | null;
  /** true / false, or null while not decided yet. */
  met: boolean | null;
};

/** "6h 12m", "2d 3h", "45m" (at least 1m). */
export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  return `${rest}m`;
}

/**
 * The SLA panel's headline during execution (boards Offboarding in execution
 * and SLA missed or met). The database decides met / missed; the clock only
 * words the time left.
 */
export function slaHeadline(
  dueAt: string,
  sla: SlaResult,
  now: number,
): { kind: "due" | "overdue" | "met" | "missed"; text: string } {
  const due = new Date(dueAt).getTime();
  if (sla.met === true && sla.removedAt) {
    return { kind: "met", text: "Removed in time" };
  }
  if (sla.met === false && sla.removedAt) {
    return {
      kind: "missed",
      text: `Late by ${formatDuration(new Date(sla.removedAt).getTime() - due)}`,
    };
  }
  if (now > due) {
    return { kind: "overdue", text: `Overdue by ${formatDuration(now - due)}` };
  }
  return { kind: "due", text: `Due in ${formatDuration(due - now)}` };
}

/**
 * Review & sign: private.offboarding_blockers() adds its lines to the
 * "missing" list. They are shown as their own checks, each with the section
 * that fixes it; the rest stay "Required fields empty". Keep the prefixes in
 * step with the database function (supabase/migrations/…_offboarding_work.sql).
 */
const BLOCKER_SECTIONS: [prefix: string, section: number, target?: string][] = [
  ["Access removal SLA", 8],
  ["Reason the access removal SLA was missed", 8, '[data-fix="sla-reason"]'],
  ["At least one application or access to remove", 5],
  ["Removal method", 5, '[data-fix="removal-method"]'],
  ["Applications removed", 5, '[data-fix="app-done"]'],
  ["Equipment received or marked not returned", 6],
  ["Access disabled or removed", 7, '[data-fix="access-done"]'],
  ["Data & mailbox go to", 7, '[data-fix="handover"]'],
  ["Mailbox:", 7, '[data-fix="mailbox"]'],
  // Access change (F10a-2): nothing to change = nothing to sign.
  ["At least one change", 5],
];

export function splitBlockers(missing: string[]): {
  fields: string[];
  blockers: { label: string; section: number; target?: string }[];
} {
  const fields: string[] = [];
  const blockers: { label: string; section: number; target?: string }[] = [];
  for (const label of missing) {
    const hit = BLOCKER_SECTIONS.find(([prefix]) => label.startsWith(prefix));
    if (hit)
      blockers.push(
        hit[2]
          ? { label, section: hit[1], target: hit[2] }
          : { label, section: hit[1] },
      );
    else fields.push(label);
  }
  return { fields, blockers };
}

/**
 * The SLA badge in the Requests list (F09d-4): an offboarding being worked on
 * (in execution or returned) with a deadline. The list doesn't know the
 * ticks, so it only says whether the deadline is ahead or has passed.
 */
export function slaBadge(
  row: { type: string; state: string; sla_due_at: string | null },
  now: number,
): { text: string; late: boolean } | null {
  if (row.type !== "offboarding" || !row.sla_due_at) return null;
  if (row.state !== "in_execution" && row.state !== "returned") return null;
  const left = new Date(row.sla_due_at).getTime() - now;
  return left > 0
    ? { text: `SLA due in ${formatDuration(left)}`, late: false }
    : { text: "SLA deadline passed", late: true };
}
