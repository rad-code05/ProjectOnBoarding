"use server";

import * as z from "zod";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { allUsersArgs } from "@/lib/reports/all-users";
import { parseReportFilters } from "@/lib/reports/filters";
import type { ReportGroup } from "@/lib/reports/groups";
import { summarise } from "@/lib/reports/months";
import { loadOnboardedBy } from "@/lib/reports/onboarded-by";
import { onboardedMonths, onboardedSpan } from "@/lib/reports/onboarded";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { companyTimezone } from "@/lib/time/display";

/** The filters sheet's "Show N requests" while choices change. */
export async function countAllUsers(search: string): Promise<number | null> {
  await requireRole(...PAGES.reports.roles);
  const parsed = z.string().max(1000).safeParse(search);
  if (!parsed.success) return null;
  const filters = parseReportFilters(
    Object.fromEntries(new URLSearchParams(parsed.data)),
  );
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("report_all_users", {
    ...allUsersArgs(filters, await companyTimezone()),
    p_limit: 1,
  });
  if (error) return null;
  return Number(data?.[0]?.total_count ?? 0);
}

/** "Show N onboardings" for Onboarded by month. */
export async function countOnboarded(search: string): Promise<number | null> {
  await requireRole(...PAGES.reports.roles);
  const parsed = z.string().max(1000).safeParse(search);
  if (!parsed.success) return null;
  const filters = parseReportFilters(
    Object.fromEntries(new URLSearchParams(parsed.data)),
  );
  try {
    const timeZone = await companyTimezone();
    const months = await onboardedMonths(
      await onboardedSpan(filters, timeZone),
      filters,
    );
    return summarise(months).total;
  } catch {
    return null;
  }
}

/** "Show N onboardings" for Onboarded by country / department. */
export async function countOnboardedBy(
  group: ReportGroup,
  search: string,
): Promise<number | null> {
  await requireRole(...PAGES.reports.roles);
  const parsed = z
    .tuple([z.enum(["country", "department"]), z.string().max(1000)])
    .safeParse([group, search]);
  if (!parsed.success) return null;
  const filters = parseReportFilters(
    Object.fromEntries(new URLSearchParams(parsed.data[1])),
  );
  try {
    const report = await loadOnboardedBy(
      parsed.data[0],
      filters,
      await companyTimezone(),
    );
    return report.total;
  } catch {
    return null;
  }
}
