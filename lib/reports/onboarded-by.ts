import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reportRange, type ReportFilters } from "./filters";
import { groupRows, type ReportGroup } from "./groups";

/**
 * Onboarded by country / department (D16: closed by the approver in the
 * period, company timezone). The database checks the reader; RLS decides
 * which requests count for them.
 */
export async function loadOnboardedBy(
  group: ReportGroup,
  filters: Pick<
    ReportFilters,
    "period" | "from" | "to" | "country" | "department"
  >,
  timeZone: string,
) {
  const supabase = createServerSupabaseClient();
  const range = reportRange(
    { ...filters, q: "", type: null, limit: 0 },
    timeZone,
  );
  const { data, error } = await supabase.rpc("report_onboarded_by", {
    p_group: group,
    p_from: range.from ?? undefined,
    p_to: range.to ?? undefined,
    p_country: filters.country ?? undefined,
    p_department: filters.department ?? undefined,
  });
  if (error) throw new Error(`Could not load the report: ${error.message}`);
  return groupRows(data ?? [], group);
}
