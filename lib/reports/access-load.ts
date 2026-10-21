import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  accessHolder,
  accessItems,
  accessTotals,
  permissionBars,
  type AccessHolder,
  type AccessItem,
  type AccessKind,
  type AccessTotals,
} from "./access";
import { placeArgs, type ReportFilters } from "./filters";
import type { GroupRow } from "./groups";

/** Arguments shared by both access functions (no period: today). */
export function accessArgs(kind: AccessKind, filters: ReportFilters) {
  return {
    p_kind: kind,
    p_department: filters.department ?? undefined,
    p_country: filters.country ?? undefined,
    ...placeArgs(filters),
    p_search: filters.q || undefined,
  };
}

/** People per application / device / access type today, with the totals. */
export async function loadAccessByItem(
  kind: AccessKind,
  filters: ReportFilters,
): Promise<{ items: AccessItem[]; totals: AccessTotals }> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "report_access_by_item",
    accessArgs(kind, filters),
  );
  if (error) throw new Error(`Could not load the report: ${error.message}`);
  return { items: accessItems(data ?? []), totals: accessTotals(data ?? []) };
}

export type AccessHolders = {
  /** The item's name and category (from the first row). */
  name: string | null;
  category: string | null;
  rows: AccessHolder[];
  total: number;
  permissions: GroupRow[];
};

/** The people holding one item today. */
export async function loadAccessHolders(
  kind: AccessKind,
  itemKey: string,
  filters: ReportFilters,
  options: { timeZone: string; canOpenRequests: boolean; isApprover: boolean },
): Promise<AccessHolders> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("report_access_holders", {
    ...accessArgs(kind, filters),
    p_item_key: itemKey,
    p_limit: filters.limit,
  });
  if (error) throw new Error(`Could not load the report: ${error.message}`);
  const first = data?.[0];
  return {
    name: first?.name ?? null,
    category: first?.category_name ?? null,
    rows: (data ?? []).map((r) => accessHolder(r, kind, options)),
    total: Number(first?.total_count ?? 0),
    permissions: permissionBars(first?.permission_counts),
  };
}
