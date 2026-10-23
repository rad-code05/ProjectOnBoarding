import "server-only";
import {
  createServerSupabaseClient,
  type ServerSupabase,
} from "@/lib/supabase/server";
import { employeeCard, officeLines } from "./employees";
import { placeArgs, type ReportFilters } from "./filters";

/** Arguments both functions take (no period or type: today). */
export function employeesArgs(filters: ReportFilters) {
  return {
    p_department: filters.department ?? undefined,
    p_country: filters.country ?? undefined,
    ...placeArgs(filters),
  };
}

/**
 * Employees by office (F27e): people employed today per office, the US by
 * state and city. The database checks the reader; RLS decides which
 * requests count for them.
 */
export async function loadEmployeesByOffice(
  filters: ReportFilters,
  supabase: ServerSupabase = createServerSupabaseClient(),
) {
  const { data, error } = await supabase.rpc(
    "report_employees_by_office",
    employeesArgs(filters),
  );
  if (error) throw new Error(`Could not load the report: ${error.message}`);
  return officeLines(data ?? []);
}

/** The people (one page), with how many match. */
export async function loadEmployees(
  filters: ReportFilters,
  options: { timeZone: string; canOpenRequests: boolean; isApprover: boolean },
  supabase: ServerSupabase = createServerSupabaseClient(),
) {
  const { data, error } = await supabase.rpc("report_employees", {
    ...employeesArgs(filters),
    p_search: filters.q || undefined,
    p_limit: filters.limit,
  });
  if (error) throw new Error(`Could not load the report: ${error.message}`);
  return {
    rows: (data ?? []).map((r) => employeeCard(r, options)),
    total: Number(data?.[0]?.total_count ?? 0),
  };
}
