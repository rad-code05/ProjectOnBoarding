import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildLeavers, type Leaver } from "./leavers-shared";

const OPEN_STATES = [
  "draft",
  "in_execution",
  "pending_confirmation",
  "returned",
] as const;

/**
 * "Who is leaving?" (F09c) / "Who is changing?" (F10b): everyone who holds
 * something in the access inventory (built from closed requests), with their
 * last known department and country, how many items they hold, and any
 * offboarding or access change already open.
 */
export async function listLeavers(): Promise<Leaver[]> {
  const supabase = createServerSupabaseClient();
  const held = await supabase
    .from("employee_access_inventory")
    .select(
      "employee_id, granted_at, granted:requests!employee_access_inventory_granted_request_id_fkey(ticket_id)",
    )
    .is("ended_at", null);
  if (held.error)
    throw new Error(`Could not load the inventory: ${held.error.message}`);
  const ids = [...new Set((held.data ?? []).map((row) => row.employee_id))];
  if (ids.length === 0) return [];

  const [people, closed, open] = await Promise.all([
    supabase
      .from("employees")
      .select("id, work_email, first_name, last_name")
      .in("id", ids),
    supabase
      .from("requests")
      .select(
        "employee_id, first_name, last_name, country, closed_at, department:departments(name)",
      )
      .eq("state", "closed")
      .in("employee_id", ids)
      .order("closed_at", { ascending: false }),
    supabase
      .from("requests")
      .select("employee_id, ticket_id, type")
      .in("type", ["offboarding", "access_modification"])
      .in("state", OPEN_STATES)
      .in("employee_id", ids),
  ]);
  for (const result of [people, closed, open]) {
    if (result.error)
      throw new Error(`Could not load people: ${result.error.message}`);
  }

  return buildLeavers({
    held: (held.data ?? []).map((row) => ({
      employeeId: row.employee_id,
      grantedAt: row.granted_at,
      ticketId: row.granted?.ticket_id ?? null,
    })),
    people: (people.data ?? []).map((p) => ({
      id: p.id,
      email: p.work_email,
      firstName: p.first_name,
      lastName: p.last_name,
    })),
    closed: (closed.data ?? []).flatMap((r) =>
      r.employee_id
        ? [
            {
              employeeId: r.employee_id,
              firstName: r.first_name,
              lastName: r.last_name,
              department: r.department?.name ?? null,
              country: r.country,
            },
          ]
        : [],
    ),
    open: (open.data ?? []).flatMap((r) =>
      r.employee_id
        ? [
            {
              employeeId: r.employee_id,
              ticketId: r.ticket_id,
              type:
                r.type === "access_modification"
                  ? ("access_modification" as const)
                  : ("offboarding" as const),
            },
          ]
        : [],
    ),
  });
}
