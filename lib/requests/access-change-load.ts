import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildHeld,
  type HeldItem,
  type HeldKind,
  type PreviousDetails,
} from "./access-change";

type Supabase = ReturnType<typeof createServerSupabaseClient>;

/** A line of this request that may point to a held item. */
export type RequestLine = {
  id: string;
  inventory_id: string | null;
  action: string;
  value: string | null;
  notes: string | null;
};

/**
 * Access change (F10c): what the person holds today with this request's
 * change for each, and section 2 as it was on their previous closed request.
 * Empty for an access change without a person (not in the app yet).
 */
export async function loadAccessChange(
  supabase: Supabase,
  request: { id: string; employee_id: string | null },
  lines: RequestLine[],
): Promise<{ held: HeldItem[]; previous: PreviousDetails | null }> {
  if (!request.employee_id) return { held: [], previous: null };

  const [inventory, previous] = await Promise.all([
    supabase
      .from("employee_access_inventory")
      .select(
        "id, kind, app_id, equipment_type_id, access_type_id, name, category_name, permission, asset_tag, description, granted_at, granted:requests!employee_access_inventory_granted_request_id_fkey(ticket_id)",
      )
      .eq("employee_id", request.employee_id)
      .is("ended_at", null),
    supabase
      .from("requests")
      .select(
        "ticket_id, job_title, department_id, country, manager_name, requestor_name, office_id, region_id, office_city_id, nationalities, department:departments(name), office:offices(name), region:country_regions(name), office_city:office_cities(name)",
      )
      .eq("employee_id", request.employee_id)
      .eq("state", "closed")
      .neq("id", request.id)
      .order("closed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (inventory.error) {
    throw new Error(
      `Could not load what they hold: ${inventory.error.message}`,
    );
  }
  if (previous.error) {
    throw new Error(
      `Could not load their last request: ${previous.error.message}`,
    );
  }
  const rows = inventory.data ?? [];

  // Options for the held items — also retired apps / types they still hold.
  const appIds = rows.flatMap((r) => (r.app_id === null ? [] : [r.app_id]));
  const typeIds = rows.flatMap((r) =>
    r.access_type_id === null ? [] : [r.access_type_id],
  );
  const [apps, types] = await Promise.all([
    appIds.length
      ? supabase
          .from("catalog_apps")
          .select("id, actions, permissions, multi_permission")
          .in("id", appIds)
      : Promise.resolve({ data: [], error: null }),
    typeIds.length
      ? supabase
          .from("physical_access_types")
          .select("id, actions, scopes")
          .in("id", typeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (apps.error || types.error) {
    throw new Error("Could not load the catalog for what they hold.");
  }

  const held = buildHeld({
    inventory: rows.map((r) => ({
      id: r.id,
      kind: r.kind as HeldKind,
      app_id: r.app_id,
      equipment_type_id: r.equipment_type_id,
      access_type_id: r.access_type_id,
      name: r.name,
      category_name: r.category_name,
      permission: r.permission,
      asset_tag: r.asset_tag,
      description: r.description,
      granted_at: r.granted_at,
      granted_ticket: r.granted?.ticket_id ?? null,
    })),
    apps: new Map(
      (apps.data ?? []).map((a) => [
        a.id,
        {
          actions: a.actions,
          permissions: a.permissions,
          multiple: a.multi_permission,
        },
      ]),
    ),
    accessTypes: new Map(
      (types.data ?? []).map((t) => [
        t.id,
        { actions: t.actions, scopes: t.scopes },
      ]),
    ),
    lines,
  });

  const p = previous.data;
  return {
    held,
    previous: p
      ? {
          ticketId: p.ticket_id,
          job_title: p.job_title,
          department_id: p.department_id,
          department: p.department?.name ?? null,
          country: p.country,
          manager_name: p.manager_name,
          requestor_name: p.requestor_name,
          office_id: p.office_id,
          office: p.office?.name ?? null,
          region_id: p.region_id,
          region: p.region?.name ?? null,
          office_city_id: p.office_city_id,
          office_city: p.office_city?.name ?? null,
          nationalities: p.nationalities ?? [],
        }
      : null,
  };
}
