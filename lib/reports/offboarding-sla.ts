import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { placeArgs, type ReportFilters } from "./filters";
import {
  slaRange,
  slaReportRow,
  slaSummary,
  type SlaReportRow,
  type SlaSummary,
} from "./sla";

/**
 * The report_offboarding_sla() arguments for these filters. The request
 * type does not apply (offboardings only); upcoming deadlines are included.
 */
export function slaArgs(filters: ReportFilters, timeZone: string) {
  const range = slaRange(filters, timeZone);
  return {
    p_from: range.from ?? undefined,
    p_to: range.to ?? undefined,
    p_country: filters.country ?? undefined,
    p_department: filters.department ?? undefined,
    ...placeArgs(filters),
    p_search: filters.q || undefined,
  };
}

export type SlaReport = {
  rows: SlaReportRow[];
  total: number;
  summary: SlaSummary;
};

/**
 * The Offboarding SLA: offboardings whose deadline falls in the period,
 * from Start execution on (decided 2026-10-20). The database checks the
 * reader and applies the usual visibility.
 */
export async function loadSlaReport(
  filters: ReportFilters,
  options: { timeZone: string; canOpenRequests: boolean; isApprover: boolean },
): Promise<SlaReport> {
  const supabase = createServerSupabaseClient();
  const args = slaArgs(filters, options.timeZone);
  const [list, summary] = await Promise.all([
    supabase.rpc("report_offboarding_sla", { ...args, p_limit: filters.limit }),
    supabase.rpc("report_offboarding_sla_summary", args),
  ]);
  const error = list.error ?? summary.error;
  if (error) throw new Error(`Could not load the report: ${error.message}`);
  return {
    rows: (list.data ?? []).map((r) => slaReportRow(r, options)),
    total: Number(list.data?.[0]?.total_count ?? 0),
    summary: slaSummary(summary.data ?? []),
  };
}
