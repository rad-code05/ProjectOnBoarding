import type { Json } from "@/lib/supabase/database.types";
import { reportDays, type ReportFilters } from "./filters";

/**
 * The filters as stored with a report.exported audit entry: the days really
 * covered (company timezone) and every other filter that was set.
 */
export function exportFilters(filters: ReportFilters, timeZone: string): Json {
  const days = reportDays(filters, timeZone);
  return {
    from: days.first,
    to: days.last,
    type: filters.type,
    country: filters.country,
    department: filters.department,
    search: filters.q || null,
  };
}

/** "all-users_2025-10-16_2026-10-15.csv", "all-users_all-time.csv". */
export function exportFileName(
  slug: string,
  days: { first: string | null; last: string | null },
  ext: "csv" | "pdf",
): string {
  const span =
    days.first || days.last
      ? `${days.first ?? "start"}_${days.last ?? "today"}`
      : "all-time";
  return `${slug}_${span}.${ext}`;
}
