"use server";

import * as z from "zod";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { parseAccessKind, parseItemKey } from "@/lib/reports/access";
import { accessArgs } from "@/lib/reports/access-load";
import { allUsersArgs } from "@/lib/reports/all-users";
import { parseReportFilters } from "@/lib/reports/filters";
import type { ReportGroup } from "@/lib/reports/groups";
import { summarise } from "@/lib/reports/months";
import { loadOnboardedBy } from "@/lib/reports/onboarded-by";
import { onboardedMonths, onboardedSpan } from "@/lib/reports/onboarded";
import { employeesArgs } from "@/lib/reports/employees-load";
import { openArgs } from "@/lib/reports/open-load";
import { slaArgs } from "@/lib/reports/offboarding-sla";
import { signatureArgs } from "@/lib/reports/signature-log";
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

/** "Show N onboardings" for Onboarded by country / department / office. */
export async function countOnboardedBy(
  group: ReportGroup,
  search: string,
): Promise<number | null> {
  await requireRole(...PAGES.reports.roles);
  const parsed = z
    .tuple([z.enum(["country", "department", "office"]), z.string().max(1000)])
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

/** "Show N requests" for the Signature log. */
export async function countSignatureLog(
  search: string,
): Promise<number | null> {
  await requireRole(...PAGES.reports.roles);
  const parsed = z.string().max(1000).safeParse(search);
  if (!parsed.success) return null;
  const filters = parseReportFilters(
    Object.fromEntries(new URLSearchParams(parsed.data)),
  );
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("report_signature_log", {
    ...signatureArgs(filters, await companyTimezone()),
    p_limit: 1,
  });
  if (error) return null;
  return Number(data?.[0]?.total_count ?? 0);
}

/** "Show N offboardings" for the Offboarding SLA. */
export async function countOffboardingSla(
  search: string,
): Promise<number | null> {
  await requireRole(...PAGES.reports.roles);
  const parsed = z.string().max(1000).safeParse(search);
  if (!parsed.success) return null;
  const filters = parseReportFilters(
    Object.fromEntries(new URLSearchParams(parsed.data)),
  );
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("report_offboarding_sla", {
    ...slaArgs(filters, await companyTimezone()),
    p_limit: 1,
  });
  if (error) return null;
  return Number(data?.[0]?.total_count ?? 0);
}

/** "Show N people" for Access by application (one item when `item` is set). */
export async function countAccess(
  kind: string,
  item: string | null,
  search: string,
): Promise<number | null> {
  await requireRole(...PAGES.reports.roles);
  const parsed = z.string().max(1000).safeParse(search);
  if (!parsed.success) return null;
  const filters = parseReportFilters(
    Object.fromEntries(new URLSearchParams(parsed.data)),
  );
  const accessKind = parseAccessKind(kind);
  const supabase = createServerSupabaseClient();
  const itemKey = parseItemKey(item ?? undefined);
  if (itemKey) {
    const { data, error } = await supabase.rpc("report_access_holders", {
      ...accessArgs(accessKind, filters),
      p_item_key: itemKey,
      p_limit: 1,
    });
    if (error) return null;
    return Number(data?.[0]?.total_count ?? 0);
  }
  const { data, error } = await supabase.rpc(
    "report_access_by_item",
    accessArgs(accessKind, filters),
  );
  if (error) return null;
  return Number(data?.[0]?.total_people ?? 0);
}

/** "Show N requests" for Open requests by status. */
export async function countOpenRequests(
  search: string,
): Promise<number | null> {
  await requireRole(...PAGES.reports.roles);
  const parsed = z.string().max(1000).safeParse(search);
  if (!parsed.success) return null;
  const filters = parseReportFilters(
    Object.fromEntries(new URLSearchParams(parsed.data)),
  );
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("report_open_requests", {
    ...openArgs(filters),
    p_limit: 1,
  });
  if (error) return null;
  return Number(data?.[0]?.total_count ?? 0);
}

/** "Show N employees" / "Show N people" for Employees by office (today). */
export async function countEmployees(search: string): Promise<number | null> {
  await requireRole(...PAGES.reports.roles);
  const parsed = z.string().max(1000).safeParse(search);
  if (!parsed.success) return null;
  const filters = parseReportFilters(
    Object.fromEntries(new URLSearchParams(parsed.data)),
  );
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("report_employees", {
    ...employeesArgs(filters),
    p_search: filters.q || undefined,
    p_limit: 1,
  });
  if (error) return null;
  return Number(data?.[0]?.total_count ?? 0);
}

/**
 * Deletes one of your custom reports (F17a). RLS only lets you delete your
 * own; the database records it (report.custom_deleted).
 */
export async function deleteCustomReport(id: string): Promise<boolean> {
  await requireRole(...PAGES.reports.roles);
  if (!z.uuid().safeParse(id).success) return false;
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("custom_reports")
    .delete()
    .eq("id", id)
    .select("id");
  return !error && (data?.length ?? 0) === 1;
}
