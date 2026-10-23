import "server-only";
import {
  createServerSupabaseClient,
  type ServerSupabase,
} from "@/lib/supabase/server";
import type { ReportFilters } from "./filters";
import {
  openRow,
  openSummary,
  type OpenSummary,
  type RawOpenRow,
} from "./open";

/** report_open_requests() arguments: right now — search and type only. */
export function openArgs(filters: ReportFilters) {
  return {
    p_type: filters.type ?? undefined,
    p_search: filters.q || undefined,
  };
}

/**
 * Open requests by status (decided 2026-10-20: right now; waiting since the
 * status was reached). The database checks the reader and applies the usual
 * visibility — approvers see awaiting confirmation and returned only.
 */
export async function loadOpenRequests(
  filters: ReportFilters,
  options: { timeZone: string; canOpenRequests: boolean; isApprover: boolean },
  supabase: ServerSupabase = createServerSupabaseClient(),
): Promise<{ raw: RawOpenRow[]; summary: OpenSummary }> {
  const { data, error } = await supabase.rpc(
    "report_open_requests",
    openArgs(filters),
  );
  if (error) throw new Error(`Could not load the report: ${error.message}`);
  const raw = data ?? [];
  const now = new Date();
  return {
    raw,
    summary: openSummary(
      raw,
      raw.map((r) => openRow(r, { ...options, now })),
    ),
  };
}
