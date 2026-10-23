import "server-only";
import {
  createServerSupabaseClient,
  type ServerSupabase,
} from "@/lib/supabase/server";
import { zonedParts } from "@/lib/time/zoned";
import { placeArgs, type PlaceKey, type ReportFilters } from "./filters";
import { monthOf, monthSpan, type MonthCount } from "./months";

/** The months a report covers for these filters (company timezone). */
export async function onboardedSpan(
  filters: ReportFilters,
  timeZone: string,
  supabase: ServerSupabase = createServerSupabaseClient(),
) {
  const today = zonedParts(new Date().toISOString(), timeZone).date;
  let earliest: string | null = null;
  if (!filters.from && filters.period === "all") {
    // "All time": from the first closed onboarding this reader may see.
    const { data } = await supabase
      .from("requests")
      .select("closed_at")
      .eq("type", "onboarding")
      .eq("state", "closed")
      .not("closed_at", "is", null)
      .order("closed_at")
      .limit(1);
    const first = data?.[0]?.closed_at;
    earliest = first ? zonedParts(first, timeZone).date : null;
  }
  return { ...monthSpan(filters, today, earliest), today };
}

/** report_onboarded_by_month() for a span, with the country / department filters. */
export async function onboardedMonths(
  span: { first: string; last: string },
  filters: Pick<ReportFilters, "country" | "department" | PlaceKey>,
  supabase: ServerSupabase = createServerSupabaseClient(),
): Promise<MonthCount[]> {
  const { data, error } = await supabase.rpc("report_onboarded_by_month", {
    p_from_month: span.first,
    p_to_month: span.last,
    p_country: filters.country ?? undefined,
    p_department: filters.department ?? undefined,
    ...placeArgs(filters),
  });
  if (error) throw new Error(`Could not load the report: ${error.message}`);
  return (data ?? []).map((r) => ({ month: r.month, onboarded: r.onboarded }));
}

/**
 * Onboarded by month (D16: closed by the approver, company timezone): every
 * month of the period, plus this month's count for the first tile.
 */
export async function loadOnboardedByMonth(
  filters: ReportFilters,
  timeZone: string,
) {
  const span = await onboardedSpan(filters, timeZone);
  const thisMonth = monthOf(span.today);
  const [months, current] = await Promise.all([
    onboardedMonths(span, filters),
    onboardedMonths({ first: thisMonth, last: thisMonth }, filters),
  ]);
  return {
    span,
    months,
    thisMonth: { month: thisMonth, onboarded: current[0]?.onboarded ?? 0 },
  };
}
