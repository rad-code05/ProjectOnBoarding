import type { Database } from "@/lib/supabase/database.types";
import type { Row } from "./datasets";

type Fn = Database["public"]["Functions"];
export type EmployeeRow = Fn["report_employees"]["Returns"][number];
export type HeldRow = Fn["report_access_held"]["Returns"][number];
export type RequestRow = Fn["report_all_users"]["Returns"][number];
export type SignatureRow = Fn["report_signature_log"]["Returns"][number];
export type SlaRow = Fn["report_offboarding_sla"]["Returns"][number];

/**
 * Turns the report functions' rows into data set rows (field key → value,
 * `datasets.ts`). Pure: `load.ts` reads the rows with the reader's own
 * access, these only rename and join them.
 */

const fullName = (first: string | null, last: string | null, email: string) =>
  [first, last].filter(Boolean).join(" ") || email;

/** "Slack · Regular Member" — what the Holds field and the Item column show. */
export function holdingLabel(h: {
  name: string;
  permission: string | null;
}): string {
  return h.permission ? `${h.name} · ${h.permission}` : h.name;
}

/** The person fields every data set shares, from People today. */
type Person = Pick<
  Row,
  | "name"
  | "email"
  | "department"
  | "office"
  | "state"
  | "city"
  | "country"
  | "nationalities"
>;

function personOf(e: EmployeeRow): Person {
  return {
    name: fullName(e.first_name, e.last_name, e.work_email),
    email: e.work_email,
    department: e.department,
    office: e.office,
    state: e.region,
    city: e.city,
    country: e.country,
    nationalities: e.nationalities ?? [],
  };
}

/** No-one employed today with this email: name and email only. */
const unknownPerson = (
  first: string | null,
  last: string | null,
  email: string,
): Person => ({
  name: fullName(first, last, email),
  email,
  department: null,
  office: null,
  state: null,
  city: null,
  country: null,
  nationalities: [],
});

/** People today, each with what they hold. Also keyed for the other sets. */
export function peopleRows(employees: EmployeeRow[], held: HeldRow[]) {
  const holds = new Map<string, HeldRow[]>();
  for (const h of held) {
    const list = holds.get(h.employee_id) ?? [];
    list.push(h);
    holds.set(h.employee_id, list);
  }
  const byEmployee = new Map<string, Person & { leaving: boolean }>();
  const byEmail = new Map<string, Person>();
  const rows: Row[] = employees.map((e) => {
    const person = personOf(e);
    const leaving = e.leaving_request_id !== null;
    byEmployee.set(e.employee_id, { ...person, leaving });
    byEmail.set(e.work_email, person);
    return {
      ...person,
      onboarded_at: e.onboarded_at,
      ticket: e.latest_ticket_id,
      leaving,
      leaving_ticket: e.leaving_ticket_id,
      holds: (holds.get(e.employee_id) ?? []).map(holdingLabel),
    };
  });
  return { rows, byEmployee, byEmail, holds };
}

/** Access held: one row per person and item, with the person's fields. */
export function accessRows(
  held: HeldRow[],
  byEmployee: Map<string, Person & { leaving: boolean }>,
): Row[] {
  return held.flatMap((h) => {
    // Held by someone not employed today (left without an offboarding
    // closing it, or not visible to the reader): left out, as in People.
    const person = byEmployee.get(h.employee_id);
    if (!person) return [];
    return [
      {
        ...person,
        kind: h.kind,
        item: h.name,
        category: h.category_name,
        role: h.permission,
        asset_tag: h.asset_tag,
        granted_at: h.granted_at,
        granted_ticket: h.granted_ticket_id,
      },
    ];
  });
}

/** "Texas · Austin" → state and city. */
function splitLocation(location: string | null) {
  const [state = null, city = null] = location ? location.split(" · ") : [];
  return { state, city };
}

/** Requests: the request's own place and nationality (as typed on it). */
export function requestRows(requests: RequestRow[]): Row[] {
  return requests.map((r) => ({
    ticket: r.ticket_id,
    type: r.type,
    status: r.state,
    name: fullName(r.first_name, r.last_name, r.work_email),
    email: r.work_email,
    department: r.department,
    office: r.office,
    ...splitLocation(r.location),
    country: r.country,
    nationalities: r.nationalities ?? [],
    effective_date: r.effective_date,
    last_working_day: r.last_working_day,
    created_at: r.created_at,
    closed_at: r.closed_at,
  }));
}

/**
 * Where each email works, for Signatures and Offboarding SLA: People today
 * first (their latest closed request), else the person's latest request the
 * reader may see — leavers are no longer "today" but their offboarding still
 * has an office.
 */
export function personIndex(
  today: Map<string, Person>,
  requests: Row[],
): Map<string, Person> {
  const index = new Map(today);
  const newestFirst = [...requests].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );
  for (const r of newestFirst) {
    const email = String(r.email);
    if (index.has(email)) continue;
    index.set(email, {
      name: r.name,
      email,
      department: r.department,
      office: r.office,
      state: r.state,
      city: r.city,
      country: r.country,
      nationalities: r.nationalities,
    });
  }
  return index;
}

const seconds = (from: string | null, to: string | null) =>
  from && to
    ? Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000))
    : null;

/** Signatures, with the person's fields (`personIndex`, by email). */
export function signatureRows(
  signatures: SignatureRow[],
  byEmail: Map<string, Person>,
): Row[] {
  return signatures.map((s) => ({
    ticket: s.ticket_id,
    type: s.type,
    status: s.state,
    ...(byEmail.get(s.work_email) ??
      unknownPerson(s.first_name, s.last_name, s.work_email)),
    it_signed_at: s.first_signed_at,
    it_signed_by: s.first_signed_by,
    approved_at: s.approved_at,
    approved_by: s.approved_by,
    time_to_approve: seconds(s.first_signed_at, s.approved_at),
    returns: s.returns,
  }));
}

/** Offboarding SLA, with the person's fields (`personIndex`, by email). */
export function slaRows(sla: SlaRow[], byEmail: Map<string, Person>): Row[] {
  return sla.map((s) => ({
    ticket: s.ticket_id,
    status: s.state,
    ...(byEmail.get(s.work_email) ??
      unknownPerson(s.first_name, s.last_name, s.work_email)),
    timeline: s.sla_timeline,
    cutoff_at: s.access_cutoff_at,
    due_at: s.sla_due_at,
    removed_at: s.removed_at,
    result: s.result,
    missed_reason: s.sla_missed_reason,
    removals_total: s.removals_total,
    removals_done: s.removals_done,
  }));
}
