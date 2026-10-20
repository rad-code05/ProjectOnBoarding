import { formatDay } from "@/lib/requests/format";
import {
  TYPE_LABELS,
  personName,
  type RequestState,
  type RequestType,
} from "@/lib/requests/labels";
import { formatDuration } from "@/lib/requests/offboarding";

/** The open statuses in board order, with who the request waits for. */
export const OPEN_STATES = [
  {
    state: "pending_confirmation",
    title: "Awaiting confirmation",
    with: "the approver",
  },
  { state: "in_execution", title: "In execution", with: "IT (Raju)" },
  { state: "draft", title: "Draft", with: "IT (Raju)" },
  { state: "returned", title: "Returned", with: "IT (Raju)" },
] as const satisfies readonly {
  state: RequestState;
  title: string;
  with: string;
}[];

export type OpenState = (typeof OPEN_STATES)[number]["state"];

/** The raw row from report_open_requests(). */
export type RawOpenRow = {
  id: string;
  ticket_id: string;
  type: RequestType;
  state: RequestState;
  first_name: string | null;
  last_name: string | null;
  work_email: string | null;
  created_at: string;
  waiting_since: string;
  sla_due_at: string | null;
  sla_result: string | null;
};

/** One open request (board: Phone · Open requests by status). */
export type OpenRow = {
  id: string;
  state: RequestState;
  name: string;
  /** "UAM-2026-000127 · Onboarding". */
  subtitle: string;
  /** "6d 2h" since it reached its status. */
  waiting: string;
  waitingSeconds: number;
  /** "9 Oct 2026". */
  opened: string;
  /** Offboarding SLA: "Due in 6h", "Overdue 3h", "SLA missed" — or null. */
  sla: string | null;
  href: string | null;
};

export function openRow(
  r: RawOpenRow,
  options: {
    timeZone: string;
    now?: Date;
    canOpenRequests: boolean;
    isApprover: boolean;
  },
): OpenRow {
  const now = (options.now ?? new Date()).getTime();
  const ms = Math.max(0, now - new Date(r.waiting_since).getTime());
  const due = r.sla_due_at ? new Date(r.sla_due_at).getTime() : null;
  let sla: string | null = null;
  if (due !== null && r.sla_result === "open") {
    sla = `Due in ${formatDuration(due - now)}`;
  } else if (due !== null && r.sla_result === "overdue") {
    sla = `Overdue ${formatDuration(now - due)}`;
  } else if (r.sla_result === "missed") {
    sla = "SLA missed";
  }
  return {
    id: r.id,
    state: r.state,
    name: personName(r.first_name, r.last_name) || "Unnamed person",
    subtitle: `${r.ticket_id} · ${TYPE_LABELS[r.type]}`,
    waiting: formatDuration(ms),
    waitingSeconds: ms / 1000,
    opened: formatDay(r.created_at, options.timeZone),
    sla,
    href: options.canOpenRequests
      ? `/requests/${r.id}`
      : options.isApprover
        ? `/approvals/${r.id}`
        : null,
  };
}

export type OpenGroup = {
  state: OpenState;
  title: string;
  with: string;
  rows: OpenRow[];
};

export type OpenSummary = {
  total: number;
  withApprover: number;
  withIt: number;
  /** The longest wait, and the status it is in. */
  longest: { waiting: string; title: string } | null;
  offboardings: number;
  overdue: number;
  /** Every status in board order (empty ones included, for the bars). */
  groups: OpenGroup[];
};

/** Groups (longest waiting first in each, as the database orders) and tiles. */
export function openSummary(raw: RawOpenRow[], rows: OpenRow[]): OpenSummary {
  const groups = OPEN_STATES.map((s) => ({
    state: s.state,
    title: s.title,
    with: s.with,
    rows: rows.filter((r) => r.state === s.state),
  }));
  const longest = rows.reduce<OpenRow | null>(
    (best, r) => (!best || r.waitingSeconds > best.waitingSeconds ? r : best),
    null,
  );
  const withApprover = rows.filter(
    (r) => r.state === "pending_confirmation",
  ).length;
  return {
    total: rows.length,
    withApprover,
    withIt: rows.length - withApprover,
    longest: longest
      ? {
          waiting: longest.waiting,
          title:
            OPEN_STATES.find((s) => s.state === longest.state)?.title ??
            longest.state,
        }
      : null,
    offboardings: raw.filter((r) => r.type === "offboarding").length,
    overdue: raw.filter((r) => r.sla_result === "overdue").length,
    groups,
  };
}
