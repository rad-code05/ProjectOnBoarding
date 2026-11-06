import "server-only";
import {
  countryName,
  personName,
  type RequestType,
} from "@/lib/requests/labels";
import { formatDay, formatDayTime } from "@/lib/requests/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { displayTimezone } from "@/lib/time/display";

/**
 * An Imported record (F24d, board *Phone · An imported person*): a closed
 * request made by the staff import — no snapshot, signature or app PDF; its
 * dates come from the import file. Read with the caller's own session (RLS:
 * whoever may read records).
 */
export type ImportedRecord = {
  id: string;
  ticketId: string;
  type: RequestType;
  name: string;
  employeeId: string | null;
  /** "Backend developer · Engineering · Dubai" */
  headline: string;
  rows: { label: string; value: string; note?: string }[];
  /** Onboarding: what they hold (or held) from the import; offboarding: what ended. */
  access: { name: string; permission: string | null; detail: string }[];
  /** The other record of the same person in the same import (a leaver's pair). */
  sibling: { id: string; ticketId: string; type: RequestType } | null;
  /** Still working here (no offboarding closed since): changes / offboarding allowed. */
  current: boolean;
  /** "laine-staff-reviewed.xlsx on 13 Nov 2026 by Raju Bholani" */
  importedFrom: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** null = unknown, not an Imported record, or not visible to the caller. */
export async function loadImportedRecord(
  id: string,
): Promise<ImportedRecord | null> {
  if (!UUID.test(id)) return null;
  const db = createServerSupabaseClient();
  const tzPromise = displayTimezone();
  const { data: r } = await db
    .from("requests")
    .select(
      "id, ticket_id, type, state, import_id, employee_id, first_name, last_name, work_email, job_title, country, nationalities, manager_name, effective_date, last_working_day, closed_at, department:departments(name), office:offices(name), region:country_regions(name), city:office_cities(name), import:staff_imports(file_name, finished_at, maker:app_users!staff_imports_created_by_fkey(first_name, last_name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!r || !r.import_id || r.state !== "closed") return null;

  const [items, sibling, leftSince, tz] = await Promise.all([
    db
      .from("employee_access_inventory")
      .select("name, permission, granted_at, ended_at")
      .eq(
        r.type === "offboarding" ? "ended_request_id" : "granted_request_id",
        id,
      )
      .order("name"),
    db
      .from("requests")
      .select("id, ticket_id, type")
      .eq("import_id", r.import_id)
      .eq("work_email", r.work_email ?? "")
      .neq("id", id)
      .maybeSingle(),
    r.employee_id
      ? db
          .from("requests")
          .select("id", { count: "exact", head: true })
          .eq("employee_id", r.employee_id)
          .eq("type", "offboarding")
          .eq("state", "closed")
      : Promise.resolve({ count: 0 }),
    tzPromise,
  ]);

  const day = (iso: string | null) => (iso ? formatDay(iso, tz) : "—");
  const place = [r.office?.name, r.region?.name, r.city?.name]
    .filter(Boolean)
    .join(" · ");
  const rows: ImportedRecord["rows"] = [
    { label: "Work email", value: r.work_email ?? "—" },
  ];
  if (place)
    rows.push({
      label: "Office",
      value: r.country ? `${place} · ${countryName(r.country)}` : place,
    });
  if (r.nationalities?.length)
    rows.push({
      label: "Nationality",
      value: r.nationalities.map(countryName).join(", "),
    });
  if (r.manager_name) rows.push({ label: "Manager", value: r.manager_name });
  rows.push(
    r.type === "offboarding"
      ? { label: "Left", value: day(r.closed_at), note: "From the import file" }
      : {
          label: "Started",
          value: day(r.closed_at),
          note: "From the import file",
        },
  );

  const imp = r.import;
  const maker = personName(imp?.maker?.first_name, imp?.maker?.last_name);
  return {
    id: r.id,
    ticketId: r.ticket_id,
    type: r.type,
    name: personName(r.first_name, r.last_name) || "Unnamed person",
    employeeId: r.employee_id,
    headline: [r.job_title, r.department?.name, r.office?.name]
      .filter(Boolean)
      .join(" · "),
    rows,
    access: (items.data ?? []).map((a) => ({
      name: a.name,
      permission: a.permission,
      detail:
        r.type === "offboarding" || a.ended_at
          ? `ended ${day(a.ended_at)}`
          : `since ${day(a.granted_at)}`,
    })),
    sibling: sibling.data
      ? {
          id: sibling.data.id,
          ticketId: sibling.data.ticket_id,
          type: sibling.data.type,
        }
      : null,
    current: r.type === "onboarding" && (leftSince.count ?? 0) === 0,
    importedFrom: [
      imp?.file_name ?? "an import file",
      imp?.finished_at ? `on ${formatDayTime(imp.finished_at, tz)}` : "",
      maker ? `by ${maker}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
