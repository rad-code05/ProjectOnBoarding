import type { Role } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/navigation";

/**
 * Admin · Users & roles (F18b, pure): the people, what each role means, which
 * roles can't be taken away right now, and the wording of a person's row.
 */

/** The order roles are shown in (chips, checkboxes). */
export const ROLE_ORDER: Role[] = [
  "approver",
  "requester",
  "it_operator",
  "auditor",
  "admin",
];

/** One line per role (board: Invite a person / Edit a person's roles). */
export const ROLE_NOTES: Record<Role, string> = {
  approver:
    "Confirm, sign & close — or return. Records, reports, PDFs. Never sees drafts.",
  requester: "Creates and edits requests, uses the assistant and batches.",
  it_operator: "Does the IT work, ticks section 9 and signs Review & sign.",
  auditor: "Reads records, reports and the audit log. Changes nothing.",
  admin: "Users & roles, catalog, offices, settings, AI settings.",
};

export type AdminPerson = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  roles: Role[];
  active: boolean;
  /** From Clerk; null when Clerk couldn't be asked. */
  mfa: boolean | null;
  /** From Clerk (ms since 1970); null = never, or unknown. */
  lastSignInAt: number | null;
};

export function personName(
  p: Pick<AdminPerson, "firstName" | "lastName" | "email">,
) {
  return [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || p.email;
}

/** Roles in display order. */
export function sortRoles(roles: readonly Role[]): Role[] {
  return ROLE_ORDER.filter((r) => roles.includes(r));
}

export const roleLabels = (roles: readonly Role[]) =>
  sortRoles(roles).map((r) => ROLE_LABELS[r]);

/**
 * Roles that can't be taken from this person now: they are the only active
 * approver / admin (the database refuses it too — `check_role_floor`).
 */
export function lockedRoles(
  person: AdminPerson,
  people: AdminPerson[],
): Partial<Record<Role, string>> {
  const locked: Partial<Record<Role, string>> = {};
  for (const role of ["approver", "admin"] as const) {
    if (!person.active || !person.roles.includes(role)) continue;
    const others = people.filter(
      (p) => p.active && p.id !== person.id && p.roles.includes(role),
    );
    if (others.length === 0) {
      locked[role] =
        `The only active ${ROLE_LABELS[role].toLowerCase()} — locked on.`;
    }
  }
  return locked;
}

/** "MFA on · signed in 12 Oct 09:41" — the time already formatted. */
export function personMeta(
  person: Pick<AdminPerson, "mfa" | "lastSignInAt">,
  lastSignIn: string | null,
): string {
  const mfa =
    person.mfa === null ? "MFA unknown" : person.mfa ? "MFA on" : "MFA off";
  if (person.lastSignInAt === null) {
    return `${mfa} · ${person.mfa === null ? "last sign-in unknown" : "never signed in"}`;
  }
  return `${mfa} · signed in ${lastSignIn}`;
}

/** Active first (you first, then by name), then deactivated. */
export function sortPeople(people: AdminPerson[], you: string): AdminPerson[] {
  return [...people].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      Number(b.id === you) - Number(a.id === you) ||
      personName(a).localeCompare(personName(b)),
  );
}

/** Same roles, ignoring order. */
export function sameRoles(a: readonly Role[], b: readonly Role[]) {
  return a.length === b.length && a.every((r) => b.includes(r));
}

/** The database's words, as a sentence; other failures in plain words. */
export function usersErrorMessage(
  code: string | undefined,
  message: string | undefined,
): string {
  if (code === "42501" && message === "nobody changes their own roles") {
    return "Nobody changes their own roles — ask another admin.";
  }
  if (code === "42501") return "Only an admin changes roles.";
  if ((code === "23505" || code === "23514" || code === "P0002") && message) {
    return message.charAt(0).toUpperCase() + message.slice(1) + ".";
  }
  return "Could not save. Reload and try again.";
}
