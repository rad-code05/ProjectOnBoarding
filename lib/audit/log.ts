import "server-only";
import { ROLE_LABELS } from "@/lib/navigation";
import { personName, TYPE_LABELS } from "@/lib/requests/labels";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  describeEvent,
  eventChanges,
  eventFacts,
  type ChangeRow,
  type SourceChip,
} from "./describe";
import {
  AUDIT_PAGE_SIZE,
  GROUP_LABELS,
  SOURCE_TO_DB,
  auditRange,
  type AuditFilters,
  type AuditGroup,
} from "./filters";

/** One row of the audit log, ready for the screen (no raw JSON needed). */
export type AuditEntry = {
  id: number;
  /** Server time (ISO); formatted in the viewer's timezone on screen. */
  at: string;
  who: string;
  what: string;
  context: string | null;
  chip: SourceChip;
  /** "Admin, IT operator" — the person's roles today. */
  roles: string;
  /** "UAM-2026-000141 · Anna Keller", when the event belongs to a request. */
  record: string | null;
  /** Where the record link goes (null: nothing to open for this viewer). */
  recordHref: string | null;
  /** "Access modification · Signatures & approvals". */
  kind: string;
  changes: ChangeRow[];
  facts: { label: string; value: string }[];
};

export type AuditCursor = { at: string; id: number };

export type AuditPage = {
  entries: AuditEntry[];
  total: number;
  next: AuditCursor | null;
};

export type AuditPerson = { id: string; name: string; test: boolean };

/** The filters as audit_log() / export_audit_log() arguments. */
export function filterArgs(filters: AuditFilters, timeZone: string) {
  const range = auditRange(filters, timeZone);
  return {
    p_search: filters.q || undefined,
    p_sources: filters.source ? [SOURCE_TO_DB[filters.source]] : undefined,
    p_actor: filters.who ?? undefined,
    p_groups: filters.groups.length ? filters.groups : undefined,
    p_from: range.from ?? undefined,
    p_to: range.to ?? undefined,
    p_hide_test: filters.hideTests,
  };
}

const TEST_EMAIL = /^e2e\.[^@]*\+clerk_test@/;

/**
 * Everyone with an account (admins and auditors may read them all — RLS), by
 * name: the "Who" filter, and names for events about another account.
 */
export async function loadAuditPeople(): Promise<AuditPerson[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("clerk_user_id, email, first_name, last_name")
    .order("first_name");
  if (error) throw new Error(`Could not load people: ${error.message}`);
  return (data ?? []).map((u) => ({
    id: u.clerk_user_id,
    name: personName(u.first_name, u.last_name) || u.email,
    test: TEST_EMAIL.test(u.email),
  }));
}

/**
 * One page of the audit log (newest first) with the filtered total. The
 * database checks the caller is an admin or auditor (audit_log()).
 * `canOpenRequests`: the viewer may open open requests (IT side), else only
 * closed records get a link.
 */
export async function loadAuditPage(
  filters: AuditFilters,
  options: {
    timeZone: string;
    people: Record<string, string>;
    canOpenRequests: boolean;
    after?: AuditCursor | null;
    limit?: number;
  },
): Promise<AuditPage> {
  const supabase = createServerSupabaseClient();
  const limit = options.limit ?? AUDIT_PAGE_SIZE;
  const { data, error } = await supabase.rpc("audit_log", {
    ...filterArgs(filters, options.timeZone),
    p_before_at: options.after?.at,
    p_before_id: options.after?.id,
    p_limit: limit,
  });
  if (error) throw new Error(`Could not load the audit log: ${error.message}`);
  const rows = data ?? [];

  // Which requests are closed (their record page opens for everyone here).
  const requestIds = [
    ...new Set(
      rows.map((r) => r.request_id).filter((id): id is string => !!id),
    ),
  ];
  const closed = new Set<string>();
  if (requestIds.length) {
    const { data: states } = await supabase
      .from("requests")
      .select("id, state")
      .in("id", requestIds);
    for (const s of states ?? []) if (s.state === "closed") closed.add(s.id);
  }

  const entries = rows.map((row): AuditEntry => {
    const text = describeEvent(row, { people: options.people });
    const record = row.ticket_id
      ? [row.ticket_id, row.employee_name].filter(Boolean).join(" · ")
      : null;
    return {
      id: row.id,
      at: row.created_at,
      ...text,
      roles: (row.actor_roles ?? []).map((r) => ROLE_LABELS[r]).join(", "),
      record,
      recordHref: row.request_id
        ? closed.has(row.request_id)
          ? `/records/${row.request_id}`
          : options.canOpenRequests
            ? `/requests/${row.request_id}`
            : null
        : null,
      kind: [
        row.request_type ? TYPE_LABELS[row.request_type] : null,
        GROUP_LABELS[row.group_key as AuditGroup]?.label,
      ]
        .filter(Boolean)
        .join(" · "),
      changes: eventChanges(row),
      facts: eventFacts(row),
    };
  });
  const last = rows.at(-1);
  return {
    entries,
    total: Number(rows[0]?.total_count ?? 0),
    next:
      last && rows.length === limit
        ? { at: last.created_at, id: last.id }
        : null,
  };
}

/** Only the number of events the filters match ("Show 48 events"). */
export async function countAuditEvents(
  filters: AuditFilters,
  timeZone: string,
): Promise<number> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("audit_log", {
    ...filterArgs(filters, timeZone),
    p_limit: 1,
  });
  if (error) throw new Error(`Could not count audit events: ${error.message}`);
  return Number(data?.[0]?.total_count ?? 0);
}
