"use server";

import * as z from "zod";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { allUsersArgs } from "@/lib/reports/all-users";
import { parseReportFilters } from "@/lib/reports/filters";
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
