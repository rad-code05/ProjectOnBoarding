import { personName } from "@/lib/requests/labels";

/**
 * Pure helpers for the people & access tools (F15d-2a): matching what the
 * person typed against names, emails, items and permissions, and shaping
 * the answers. No database here — the tools load, these decide.
 */

/** The IT side: everyone but approvers (PROJECT_PLAN §6.6). */
export const IT_SIDE = [
  "admin",
  "requester",
  "it_operator",
  "auditor",
] as const;

/** Requests that are still open (not closed, not cancelled). */
export const OPEN_STATES = [
  "draft",
  "in_execution",
  "pending_confirmation",
  "returned",
] as const;

/** "Zoë  Müller" → "zoe muller": case, accents and spaces don't matter. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type PersonRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

/** Every word typed appears in the name or the email ("rose bernal", "amigo@"). */
export function matchesPerson(person: PersonRow, query: string): boolean {
  const hay = normalize(
    `${personName(person.firstName, person.lastName)} ${person.email}`,
  );
  const words = normalize(query).split(" ").filter(Boolean);
  return words.length > 0 && words.every((w) => hay.includes(w));
}

/**
 * The people a query names, best first: the exact email, then the exact
 * full name, then the rest by name.
 */
export function findPeople(people: PersonRow[], query: string): PersonRow[] {
  const q = normalize(query);
  const score = (p: PersonRow) =>
    normalize(p.email) === q
      ? 0
      : normalize(personName(p.firstName, p.lastName)) === q
        ? 1
        : 2;
  return people
    .filter((p) => matchesPerson(p, query))
    .sort(
      (a, b) =>
        score(a) - score(b) ||
        personName(a.firstName, a.lastName).localeCompare(
          personName(b.firstName, b.lastName),
        ),
    );
}

/**
 * One person for "what does X hold": the exact email or full name, or the
 * only match. Several matches → the tool lists them and the model asks.
 */
export function pickPerson(
  people: PersonRow[],
  query: string,
): { person: PersonRow } | { matches: PersonRow[] } {
  const found = findPeople(people, query);
  const q = normalize(query);
  const exact = found.filter(
    (p) =>
      normalize(p.email) === q ||
      normalize(personName(p.firstName, p.lastName)) === q,
  );
  if (exact.length === 1) return { person: exact[0] };
  if (found.length === 1) return { person: found[0] };
  return { matches: found };
}

/** The item's name contains what was typed ("figma" → "Figma"). */
export function matchesItem(name: string, query: string): boolean {
  return normalize(name).includes(normalize(query));
}

/**
 * A held permission contains what was typed — any of several roles in one
 * row ("Viewer; Admin" holds Admin).
 */
export function matchesPermission(
  permission: string | null,
  query: string,
): boolean {
  if (!permission) return false;
  return permission.split(";").some((part) => matchesItem(part, query));
}

export type HeldRow = {
  kind: "application" | "equipment" | "access";
  item: string;
  permission: string | null;
  since: string;
  employeeId: string;
  person: string;
  email: string;
};

export type HolderGroup = {
  item: string;
  kind: HeldRow["kind"];
  holders: {
    person: string;
    email: string;
    permission: string | null;
    since: string;
    leaving: boolean;
  }[];
};

/** Holders grouped per item, items and people in alphabetical order. */
export function groupHolders(
  rows: HeldRow[],
  leaving: ReadonlySet<string>,
): HolderGroup[] {
  const groups = new Map<string, HolderGroup>();
  for (const row of rows) {
    const key = `${row.kind}:${row.item}`;
    const group = groups.get(key) ?? {
      item: row.item,
      kind: row.kind,
      holders: [],
    };
    group.holders.push({
      person: row.person,
      email: row.email,
      permission: row.permission,
      since: row.since,
      leaving: leaving.has(row.employeeId),
    });
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => a.item.localeCompare(b.item))
    .map((g) => ({
      ...g,
      holders: g.holders.sort((a, b) => a.person.localeCompare(b.person)),
    }));
}

/** "Rose Bernal-Test" — or the email when a person has no name yet. */
export function displayName(p: PersonRow): string {
  return personName(p.firstName, p.lastName) || p.email;
}
