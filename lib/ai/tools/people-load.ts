import "server-only";
import { personName } from "@/lib/requests/labels";
import type { ServerSupabase } from "@/lib/supabase/server";
import { OPEN_STATES, type HeldRow, type PersonRow } from "./people-shared";

/**
 * Reading for the people & access tools (F15d-2a), always with the asking
 * person's own client — RLS decides what they may see.
 */

const fail = (what: string, message: string) =>
  new Error(`Could not load ${what}: ${message}`);

/** Everyone the app knows (people requests are about). */
export async function loadPeople(db: ServerSupabase): Promise<PersonRow[]> {
  const { data, error } = await db
    .from("employees")
    .select("id, work_email, first_name, last_name");
  if (error) throw fail("people", error.message);
  return (data ?? []).map((p) => ({
    id: p.id,
    email: p.work_email,
    firstName: p.first_name,
    lastName: p.last_name,
  }));
}

/** What people hold today (the access inventory, nothing ended). */
export async function loadHeld(
  db: ServerSupabase,
  employeeIds?: string[],
): Promise<HeldRow[]> {
  let query = db
    .from("employee_access_inventory")
    .select(
      "kind, name, permission, granted_at, employee_id, employee:employees(first_name, last_name, work_email)",
    )
    .is("ended_at", null)
    .order("granted_at");
  if (employeeIds) query = query.in("employee_id", employeeIds);
  const { data, error } = await query;
  if (error) throw fail("the access inventory", error.message);
  return (data ?? []).map((row) => ({
    kind: row.kind,
    item: row.name,
    permission: row.permission,
    since: row.granted_at,
    employeeId: row.employee_id,
    person:
      personName(row.employee?.first_name, row.employee?.last_name) ||
      (row.employee?.work_email ?? ""),
    email: row.employee?.work_email ?? "",
  }));
}

export type OpenRequest = {
  employeeId: string;
  ticket: string;
  type: "onboarding" | "offboarding" | "access_modification";
  state: (typeof OPEN_STATES)[number];
};

/** Open requests about these people (or everyone). */
export async function loadOpenRequests(
  db: ServerSupabase,
  employeeIds?: string[],
): Promise<OpenRequest[]> {
  let query = db
    .from("requests")
    .select("employee_id, ticket_id, type, state")
    .in("state", OPEN_STATES)
    .not("employee_id", "is", null);
  if (employeeIds) query = query.in("employee_id", employeeIds);
  const { data, error } = await query;
  if (error) throw fail("requests", error.message);
  return (data ?? []).map((r) => ({
    employeeId: r.employee_id as string,
    ticket: r.ticket_id,
    type: r.type,
    state: r.state as OpenRequest["state"],
  }));
}

/** People with an offboarding open: "Leaving". */
export function leavingIds(open: OpenRequest[]): Set<string> {
  return new Set(
    open.filter((r) => r.type === "offboarding").map((r) => r.employeeId),
  );
}
