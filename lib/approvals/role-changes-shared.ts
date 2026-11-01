import type { Role } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/navigation";

/**
 * Role changes for approvers (F18d-2, D5 — pure): the raw events of
 * `role_changes()` → one line per change. One admin action (roles saved,
 * deactivate, reactivate, an accepted invitation) is one database transaction,
 * so its events share the same time: grouped into one line.
 */

export type RoleChangeEvent = {
  id: number;
  created_at: string;
  action: string;
  actor_name: string | null;
  target_name: string | null;
  roles: string[] | null;
  is_new: boolean;
};

export type RoleChangeLine = {
  key: string;
  at: string;
  who: string;
  what: string;
  isNew: boolean;
};

const label = (r: string) => ROLE_LABELS[r as Role] ?? r;

/** "Approver", "Approver and Auditor", "Approver, Auditor and Admin". */
export function roleList(roles: string[]): string {
  const names = [...new Set(roles)].map(label);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function describe(group: RoleChangeEvent[]): { who: string; what: string } {
  const first = group[0]!;
  const target = first.target_name ?? "someone";
  const actor = first.actor_name;
  const by = (kind: string) => group.filter((e) => e.action === kind);
  const rolesOf = (kind: string) => by(kind).flatMap((e) => e.roles ?? []);
  const given = rolesOf("role.granted");
  const taken = rolesOf("role.revoked");

  const accepted = by("user.invitation_accepted")[0];
  if (accepted) {
    return {
      who: target,
      what: `accepted the invitation — now ${roleList(accepted.roles ?? given)}`,
    };
  }
  const who = actor ?? "System";
  if (by("user.deactivated").length) {
    return {
      who,
      what: `deactivated ${target}${taken.length ? ` (${roleList(taken)} removed)` : ""}`,
    };
  }
  if (by("user.reactivated").length) {
    return {
      who,
      what: `reactivated ${target}${given.length ? ` as ${roleList(given)}` : ""}`,
    };
  }
  const invited = by("user.invited")[0];
  if (invited) {
    return {
      who,
      what: `invited ${target} as ${roleList(invited.roles ?? [])}`,
    };
  }
  if (by("user.invitation_sent_again").length) {
    return { who, what: `sent ${target}'s invitation again` };
  }
  if (by("user.invitation_withdrawn").length) {
    return { who, what: `withdrew ${target}'s invitation` };
  }
  const parts = [
    given.length ? `gave ${target} ${roleList(given)}` : "",
    taken.length
      ? `took ${roleList(taken)} ${given.length ? "away" : `from ${target}`}`
      : "",
  ].filter(Boolean);
  return { who, what: parts.join(" and ") || `changed ${target}'s roles` };
}

/** Newest first, one line per action. */
export function roleChangeLines(events: RoleChangeEvent[]): RoleChangeLine[] {
  const groups = new Map<string, RoleChangeEvent[]>();
  for (const e of events) {
    const key = `${e.created_at}|${e.actor_name ?? ""}|${e.target_name ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    at: group[0]!.created_at,
    ...describe(group),
    isNew: group.some((e) => e.is_new),
  }));
}
