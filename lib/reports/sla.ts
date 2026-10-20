import { formatDayTime } from "@/lib/requests/format";
import {
  STATE_LABELS,
  personName,
  type RequestState,
} from "@/lib/requests/labels";
import {
  TIMELINE_LABELS,
  formatDuration,
  type SlaTimeline,
} from "@/lib/requests/offboarding";
import { reportRange, type ReportFilters } from "./filters";

/** What report_offboarding_sla() says about one offboarding. */
export type SlaOutcome = "met" | "missed" | "open" | "overdue" | "no_removals";

/** One offboarding in the Offboarding SLA report (board: Phone · Offboarding SLA). */
export type SlaReportRow = {
  id: string;
  ticketId: string;
  state: RequestState;
  name: string;
  /** "UAM-2026-000152 · Same day · In execution". */
  subtitle: string;
  /** "Met", "Missed", "Due in 6h", "Overdue 3h", "No removals" — always a word. */
  result: string;
  /** met = quiet, missed = signal red, open = red outline (attention). */
  tone: "met" | "missed" | "open";
  cutoff: string;
  deadline: string;
  /** "3 of 5 removed" or "All 6 · 1 Oct 2026, 09:40". */
  removals: string;
  noteLabel: string;
  note: string;
  href: string | null;
};

/** The raw row from report_offboarding_sla() this module reads. */
export type RawSlaRow = {
  id: string;
  ticket_id: string;
  state: RequestState;
  first_name: string | null;
  last_name: string | null;
  sla_timeline: SlaTimeline | null;
  access_cutoff_at: string | null;
  sla_due_at: string;
  removals_total: number;
  removals_done: number;
  removed_at: string | null;
  result: string;
  sla_missed_reason: string | null;
};

const OUTCOMES: SlaOutcome[] = [
  "met",
  "missed",
  "open",
  "overdue",
  "no_removals",
];
const outcome = (result: string): SlaOutcome =>
  (OUTCOMES as string[]).includes(result) ? (result as SlaOutcome) : "open";

/**
 * The deadlines the report covers: from the first day of the period, and —
 * unless an end date was typed — every later deadline too, so offboardings
 * still running (due tomorrow or later) are never hidden by "12 months".
 */
export function slaRange(
  filters: ReportFilters,
  timeZone: string,
  now: Date = new Date(),
): { from: string | null; to: string | null } {
  const range = reportRange(filters, timeZone, now);
  return { from: range.from, to: filters.to ? range.to : null };
}

/** "Same day" / "Within 24h" / "Within 48h" (or "—"). */
export function timelineLabel(t: SlaTimeline | null): string {
  return t ? TIMELINE_LABELS[t] : "—";
}

/**
 * An SLA row in plain words (company timezone). Met / missed / open /
 * overdue come from the database (removal ticks, server time); the clock
 * only words how long is left or how late it is.
 */
export function slaReportRow(
  r: RawSlaRow,
  options: {
    timeZone: string;
    now?: Date;
    canOpenRequests: boolean;
    isApprover: boolean;
  },
): SlaReportRow {
  const now = (options.now ?? new Date()).getTime();
  const at = (iso: string) => formatDayTime(iso, options.timeZone);
  const due = new Date(r.sla_due_at).getTime();
  const kind = outcome(r.result);
  const allRemoved =
    r.removed_at && r.removals_total > 0
      ? `All ${r.removals_total} · ${at(r.removed_at)}`
      : null;
  const progress = `${r.removals_done} of ${r.removals_total} removed`;

  let result: string;
  let tone: SlaReportRow["tone"];
  let noteLabel: string;
  let note: string;
  switch (kind) {
    case "met":
      result = "Met";
      tone = "met";
      noteLabel = "Margin";
      note = r.removed_at
        ? `${formatDuration(due - new Date(r.removed_at).getTime())} before the deadline`
        : "—";
      break;
    case "missed":
      result = "Missed";
      tone = "missed";
      noteLabel = "Reason";
      note = r.sla_missed_reason?.trim() || "No reason recorded yet";
      break;
    case "overdue":
      result = `Overdue ${formatDuration(now - due)}`;
      tone = "open";
      noteLabel = "Status";
      note = "Will show as Missed — a reason is needed";
      break;
    case "no_removals":
      result = "No removals";
      tone = "met";
      noteLabel = "Status";
      note = "Nothing to remove was listed";
      break;
    default:
      result = `Due in ${formatDuration(due - now)}`;
      tone = "open";
      noteLabel = "Status";
      note = "Not decided yet";
  }

  return {
    id: r.id,
    ticketId: r.ticket_id,
    state: r.state,
    name: personName(r.first_name, r.last_name) || "Unnamed person",
    subtitle: [
      r.ticket_id,
      timelineLabel(r.sla_timeline),
      STATE_LABELS[r.state],
    ].join(" · "),
    result,
    tone,
    cutoff: r.access_cutoff_at ? at(r.access_cutoff_at) : "—",
    deadline: at(r.sla_due_at),
    removals: allRemoved ?? progress,
    noteLabel,
    note,
    href:
      r.state === "closed"
        ? `/records/${r.id}`
        : options.canOpenRequests
          ? `/requests/${r.id}`
          : options.isApprover
            ? `/approvals/${r.id}`
            : null,
  };
}

/** The raw row from report_offboarding_sla_summary(). */
export type RawSlaSummaryRow = {
  sla_timeline: SlaTimeline | null;
  met: number;
  missed: number;
  open: number;
  overdue: number;
  no_removals: number;
};

export type SlaTimelineCounts = {
  timeline: SlaTimeline;
  label: string;
  met: number;
  missed: number;
  /** Not all removed yet (open + overdue). */
  open: number;
};

export type SlaSummary = {
  total: number;
  met: number;
  missed: number;
  decided: number;
  /** Rounded percent of decided offboardings met; null when none decided. */
  metPercent: number | null;
  open: number;
  overdue: number;
  /** Every timeline, in order, zeros included. */
  timelines: SlaTimelineCounts[];
};

/** Tiles and the "By timeline" table from the summary rows. */
export function slaSummary(rows: RawSlaSummaryRow[]): SlaSummary {
  const timelines = (Object.keys(TIMELINE_LABELS) as SlaTimeline[]).map(
    (timeline) => {
      const r = rows.find((x) => x.sla_timeline === timeline);
      return {
        timeline,
        label: TIMELINE_LABELS[timeline],
        met: r?.met ?? 0,
        missed: r?.missed ?? 0,
        open: (r?.open ?? 0) + (r?.overdue ?? 0),
      };
    },
  );
  const sum = (f: (r: RawSlaSummaryRow) => number) =>
    rows.reduce((n, r) => n + f(r), 0);
  const met = sum((r) => r.met);
  const missed = sum((r) => r.missed);
  const decided = met + missed;
  return {
    total: sum((r) => r.met + r.missed + r.open + r.overdue + r.no_removals),
    met,
    missed,
    decided,
    metPercent: decided ? Math.round((met / decided) * 100) : null,
    open: sum((r) => r.open + r.overdue),
    overdue: sum((r) => r.overdue),
    timelines,
  };
}
