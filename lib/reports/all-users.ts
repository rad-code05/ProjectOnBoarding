import "server-only";
import { formatDate, formatDay } from "@/lib/requests/format";
import {
  countryName,
  personName,
  type RequestState,
  type RequestType,
} from "@/lib/requests/labels";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reportRange, type ReportFilters } from "./filters";

/** One request in the All users list (board: Phone · All users list). */
export type AllUsersRow = {
  id: string;
  ticketId: string;
  type: RequestType;
  state: RequestState;
  name: string;
  email: string;
  department: string | null;
  country: string | null;
  /** "Effective 20 Oct 2026 · Closed 15 Oct 2026" (company timezone). */
  dates: string;
  /** Where the row opens for this reader; null = nothing to open. */
  href: string | null;
};

export type ReportOptions = {
  departments: { id: number; name: string }[];
  /** Country codes in use on the requests this reader may see. */
  countries: string[];
};

/** Departments and countries for the filters sheet. */
export async function loadReportOptions(): Promise<ReportOptions> {
  const supabase = createServerSupabaseClient();
  const [departments, countries] = await Promise.all([
    supabase.from("departments").select("id, name").order("sort_order"),
    supabase.from("requests").select("country").not("country", "is", null),
  ]);
  if (departments.error || countries.error) {
    throw new Error("Could not load the report filters.");
  }
  return {
    departments: departments.data,
    countries: [
      ...new Set(countries.data.flatMap((r) => (r.country ? [r.country] : []))),
    ].sort((a, b) => countryName(a).localeCompare(countryName(b))),
  };
}

/** The report_all_users() arguments for these filters. */
export function allUsersArgs(filters: ReportFilters, timeZone: string) {
  const range = reportRange(filters, timeZone);
  return {
    p_from: range.from ?? undefined,
    p_to: range.to ?? undefined,
    p_type: filters.type ?? undefined,
    p_country: filters.country ?? undefined,
    p_department: filters.department ?? undefined,
    p_search: filters.q || undefined,
  };
}

/**
 * The All users list: one page of requests plus the totals. The database
 * checks the reader (admin, approver, auditor) and RLS decides which requests
 * each person sees — approvers never get drafts or work in progress.
 */
export async function loadAllUsers(
  filters: ReportFilters,
  options: { timeZone: string; canOpenRequests: boolean; isApprover: boolean },
) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("report_all_users", {
    ...allUsersArgs(filters, options.timeZone),
    p_limit: filters.limit,
  });
  if (error) throw new Error(`Could not load the report: ${error.message}`);
  const rows: AllUsersRow[] = (data ?? []).map((r) => {
    const start =
      r.type === "offboarding"
        ? `Last day ${formatDate(r.last_working_day)}`
        : `Effective ${formatDate(r.effective_date)}`;
    const end = r.closed_at
      ? `Closed ${formatDay(r.closed_at, options.timeZone)}`
      : "not closed yet";
    return {
      id: r.id,
      ticketId: r.ticket_id,
      type: r.type,
      state: r.state,
      name: personName(r.first_name, r.last_name) || "Unnamed person",
      email: r.work_email ?? "—",
      department: r.department,
      country: r.country ? countryName(r.country) : null,
      dates: `${start} · ${end}`,
      href:
        r.state === "closed"
          ? `/records/${r.id}`
          : options.canOpenRequests
            ? `/requests/${r.id}`
            : options.isApprover
              ? `/approvals/${r.id}`
              : null,
    };
  });
  return {
    rows,
    total: Number(data?.[0]?.total_count ?? 0),
    people: Number(data?.[0]?.people_count ?? 0),
  };
}
