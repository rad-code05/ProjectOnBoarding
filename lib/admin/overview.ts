import "server-only";
import { formatDay } from "@/lib/requests/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { displayTimezone } from "@/lib/time/display";
import { personName } from "@/lib/requests/labels";

/** Numbers for the Admin home (board: Phone · Admin (home)). */
export type AdminOverview = {
  appsActive: number;
  appsRetired: number;
  categories: number;
  equipmentTypes: number;
  accessTypes: number;
  companyTimezone: string;
};

export async function loadAdminOverview(): Promise<AdminOverview> {
  const supabase = createServerSupabaseClient();
  const [apps, categories, equipment, access, settings] = await Promise.all([
    supabase.from("catalog_apps").select("active"),
    supabase
      .from("catalog_categories")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
    supabase
      .from("equipment_types")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
    supabase
      .from("physical_access_types")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
    supabase.from("app_settings").select("company_timezone").maybeSingle(),
  ]);
  const rows = apps.data ?? [];
  return {
    appsActive: rows.filter((a) => a.active).length,
    appsRetired: rows.filter((a) => !a.active).length,
    categories: categories.count ?? 0,
    equipmentTypes: equipment.count ?? 0,
    accessTypes: access.count ?? 0,
    companyTimezone: settings.data?.company_timezone ?? "Asia/Dubai",
  };
}

/** Admin → Settings: the company timezone and who changed it last. */
export type CompanySettings = {
  timezone: string;
  /** "Raju Bholani · 11 Oct 2026", or null when never changed. */
  lastChanged: string | null;
};

export async function loadCompanySettings(): Promise<CompanySettings> {
  const supabase = createServerSupabaseClient();
  const [{ data }, tz] = await Promise.all([
    supabase
      .from("app_settings")
      .select(
        "company_timezone, updated_at, updated_by, editor:app_users!app_settings_updated_by_fkey(first_name, last_name)",
      )
      .maybeSingle(),
    displayTimezone(),
  ]);
  return {
    timezone: data?.company_timezone ?? "Asia/Dubai",
    lastChanged: data?.updated_by
      ? `${personName(data.editor?.first_name, data.editor?.last_name) || "An admin"} · ${formatDay(data.updated_at, tz)}`
      : null,
  };
}
