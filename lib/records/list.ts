import "server-only";
import { searchTerms, type RequestFilters } from "@/lib/requests/filters";
import { formatDay } from "@/lib/requests/format";
import { personName, type RequestType } from "@/lib/requests/labels";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { displayTimezone } from "@/lib/time/display";

/** One closed request in the Records list (board: Phone · Records). */
export type RecordRow = {
  id: string;
  ticketId: string;
  type: RequestType;
  name: string;
  /** "9 Oct 2026" (company timezone). */
  closed: string;
  approvedBy: string;
};

/**
 * Closed requests, newest first, with who approved them. Read with the
 * signed-in user's session (RLS); search and type work as on Requests.
 */
export async function listRecords(filters: RequestFilters) {
  const supabase = createServerSupabaseClient();
  const tz = await displayTimezone();
  let query = supabase
    .from("requests")
    .select(
      "id, ticket_id, type, first_name, last_name, closed_at, approvals!approvals_request_id_fkey!inner(decision, approver:app_users!approvals_decided_by_fkey(first_name, last_name))",
      { count: "exact" },
    )
    .eq("state", "closed")
    .eq("approvals.decision", "confirmed")
    .order("closed_at", { ascending: false })
    .limit(filters.limit);

  if (filters.type) query = query.eq("type", filters.type);
  // Every word must match a name, the work email or the ticket ID.
  for (const term of searchTerms(filters.q)) {
    query = query.or(
      ["first_name", "last_name", "work_email", "ticket_id"]
        .map((column) => `${column}.ilike.*${term}*`)
        .join(","),
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Could not load records: ${error.message}`);
  const rows: RecordRow[] = (data ?? []).map((row) => {
    const approver = row.approvals[0]?.approver;
    return {
      id: row.id,
      ticketId: row.ticket_id,
      type: row.type,
      name: personName(row.first_name, row.last_name) || "Unnamed person",
      closed: formatDay(row.closed_at, tz),
      approvedBy: personName(approver?.first_name, approver?.last_name) || "—",
    };
  });
  return { rows, total: count ?? 0 };
}
