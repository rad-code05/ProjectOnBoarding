import "server-only";
import {
  createServerSupabaseClient,
  type ServerSupabase,
} from "@/lib/supabase/server";
import { placeArgs, reportRange, type ReportFilters } from "./filters";
import { signatureRow, type SignatureRow } from "./signatures";

/** The report_signature_log() arguments for these filters. */
export function signatureArgs(filters: ReportFilters, timeZone: string) {
  const range = reportRange(filters, timeZone);
  return {
    p_from: range.from ?? undefined,
    p_to: range.to ?? undefined,
    p_type: filters.type ?? undefined,
    p_country: filters.country ?? undefined,
    p_department: filters.department ?? undefined,
    ...placeArgs(filters),
    p_search: filters.q || undefined,
  };
}

export type SignatureLog = {
  rows: SignatureRow[];
  total: number;
  approved: number;
  returned: number;
  /** Seconds; null when nothing was approved yet. */
  medianSeconds: number | null;
};

/**
 * The Signature log: requests IT first signed in the period (decided
 * 2026-10-20). The database checks the reader and applies the usual
 * visibility — approvers see awaiting confirmation, returned and closed.
 */
export async function loadSignatureLog(
  filters: ReportFilters,
  options: { timeZone: string; canOpenRequests: boolean; isApprover: boolean },
  supabase: ServerSupabase = createServerSupabaseClient(),
): Promise<SignatureLog> {
  const { data, error } = await supabase.rpc("report_signature_log", {
    ...signatureArgs(filters, options.timeZone),
    p_limit: filters.limit,
  });
  if (error) throw new Error(`Could not load the report: ${error.message}`);
  const first = data?.[0];
  return {
    rows: (data ?? []).map((r) => signatureRow(r, options)),
    total: Number(first?.total_count ?? 0),
    approved: Number(first?.approved_count ?? 0),
    returned: Number(first?.returned_count ?? 0),
    medianSeconds: first?.median_seconds ?? null,
  };
}
