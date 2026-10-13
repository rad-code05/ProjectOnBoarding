import { countryName, personName } from "./labels";

/** One person "Who is leaving?" offers (F09c). */
export type Leaver = {
  id: string;
  name: string;
  email: string;
  /** "Sales · Italy" — from their latest closed request. */
  detail: string;
  /** Items they hold in the access inventory. */
  items: number;
  /** Ticket of the earliest request behind what they hold. */
  since: string | null;
  /** An offboarding already open for them (only one at a time). */
  openTicket: string | null;
};

type Held = { employeeId: string; grantedAt: string; ticketId: string | null };
type Person = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};
type Closed = {
  employeeId: string;
  firstName: string | null;
  lastName: string | null;
  department: string | null;
  country: string | null;
};
type Open = { employeeId: string; ticketId: string };

/** Pure: joins the inventory, people, their latest closed request and open offboardings. */
export function buildLeavers(input: {
  held: Held[];
  people: Person[];
  /** Newest first. */
  closed: Closed[];
  open: Open[];
}): Leaver[] {
  const byPerson = new Map<string, Held[]>();
  for (const row of input.held) {
    byPerson.set(row.employeeId, [
      ...(byPerson.get(row.employeeId) ?? []),
      row,
    ]);
  }
  const latest = new Map<string, Closed>();
  for (const row of input.closed) {
    if (!latest.has(row.employeeId)) latest.set(row.employeeId, row);
  }
  const open = new Map(input.open.map((row) => [row.employeeId, row.ticketId]));

  return input.people
    .filter((person) => byPerson.has(person.id))
    .map((person) => {
      const rows = byPerson.get(person.id) ?? [];
      const last = latest.get(person.id);
      const first = [...rows].sort((a, b) =>
        a.grantedAt.localeCompare(b.grantedAt),
      )[0];
      return {
        id: person.id,
        name:
          personName(
            last?.firstName ?? person.firstName,
            last?.lastName ?? person.lastName,
          ) || person.email,
        email: person.email,
        detail: [
          last?.department,
          last?.country ? countryName(last.country) : null,
        ]
          .filter(Boolean)
          .join(" · "),
        items: rows.length,
        since: first?.ticketId ?? null,
        openTicket: open.get(person.id) ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Search by name or work email, ignoring case. */
export function filterLeavers(leavers: Leaver[], query: string): Leaver[] {
  const q = query.trim().toLowerCase();
  if (!q) return leavers;
  return leavers.filter(
    (l) =>
      l.name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q),
  );
}

/** "11 items on record · since UAM-2026-000098" */
export function leaverNote(leaver: Leaver): string {
  if (leaver.openTicket)
    return `Offboarding already open · ${leaver.openTicket}`;
  const items =
    leaver.items === 1 ? "1 item on record" : `${leaver.items} items on record`;
  return leaver.since ? `${items} · since ${leaver.since}` : items;
}
