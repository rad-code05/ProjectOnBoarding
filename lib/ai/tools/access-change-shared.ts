import type { HeldItem } from "@/lib/requests/access-change";
import { blockedReason, type Leaver } from "@/lib/requests/leavers-shared";
import { findLeaver } from "./offboarding-shared";
import {
  resolveOnboarding,
  type FormOptions,
  type OnboardingInput,
  type Suggestion,
} from "./onboarding-shared";
import { normalize } from "./people-shared";

/**
 * An access change by chat (F16d-2, pure): what changes on what the person
 * holds today — a new role / scope, or removed / returned — plus anything
 * new, and the effective date. Each becomes a suggestion; the rules are the
 * access-change screen's (the held item's own "change" and "remove"
 * actions and options, from buildHeld). Nothing is guessed.
 */

export const ACCESS_CHANGE_TOPICS = {
  changes:
    "what changes (a new role or scope, a removal / return, or something new)",
  effectiveDate: "effective date",
} as const;
export type AccessChangeTopic = keyof typeof ACCESS_CHANGE_TOPICS;

export type HeldChangeInput = {
  /** The held item as said: "Slack", "Figma", "laptop", "LT-1008". */
  item: string;
  action: "change" | "remove";
  /** change: the new role (app) or scope (access). */
  to?: string;
  reason?: string;
};

export type AccessChangeInput = {
  person: string;
  changes?: HeldChangeInput[];
  /** Something they don't hold yet (granted like on an onboarding). */
  add?: Pick<OnboardingInput, "applications" | "equipment" | "access">;
  effectiveDate?: string;
  reasons?: Partial<Record<AccessChangeTopic, string>>;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function missingAccessChangeTopics(
  input: AccessChangeInput,
): AccessChangeTopic[] {
  const any =
    (input.changes?.length ?? 0) +
    (input.add?.applications?.length ?? 0) +
    (input.add?.equipment?.length ?? 0) +
    (input.add?.access?.length ?? 0);
  const missing: AccessChangeTopic[] = [];
  if (!any) missing.push("changes");
  if (!input.effectiveDate?.trim()) missing.push("effectiveDate");
  return missing;
}

export function askAboutAccessChange(input: AccessChangeInput): string | null {
  const missing = missingAccessChangeTopics(input);
  return missing.length
    ? `Not shown to the person yet. Ask about: ${missing.map((t) => ACCESS_CHANGE_TOPICS[t]).join(", ")} — in one short numbered list. Then call again.`
    : null;
}

/** The held item meant: by asset tag, else by name (exact, then contains). */
function findHeld(
  held: HeldItem[],
  said: string,
): { item: HeldItem } | { problem: string } {
  const q = normalize(said);
  const byTag = held.filter((h) => h.assetTag && normalize(h.assetTag) === q);
  const exact = held.filter((h) => normalize(h.name) === q);
  const partial = held.filter((h) => normalize(h.name).includes(q));
  const matches = byTag.length ? byTag : exact.length ? exact : partial;
  if (matches.length === 1) return { item: matches[0] };
  const holds = held
    .map((h) => (h.assetTag ? `${h.name} (${h.assetTag})` : h.name))
    .join(", ");
  return matches.length === 0
    ? {
        problem: `They don't hold "${said}". They hold: ${holds || "nothing"}.`,
      }
    : {
        problem: `Several things match "${said}": ${matches
          .map((h) => (h.assetTag ? `${h.name} (${h.assetTag})` : h.name))
          .join(", ")}. Ask which one.`,
      };
}

/** Changes to held items → 'held' suggestions, by the screen's own rules. */
export function heldSuggestions(
  changes: HeldChangeInput[],
  held: HeldItem[],
): { suggestions: Suggestion[]; problems: string[] } {
  const suggestions: Suggestion[] = [];
  const problems: string[] = [];
  for (const c of changes) {
    const found = findHeld(held, c.item);
    if ("problem" in found) {
      problems.push(found.problem);
      continue;
    }
    const h = found.item;
    let value: { action: string; value: string | null };
    if (c.action === "remove") {
      value = { action: h.removeAction, value: h.current };
    } else {
      if (!h.changeAction) {
        problems.push(
          // Return → returned, Remove → removed, Disable → disabled.
          `${h.name} can't be changed, only ${h.removeAction.toLowerCase().replace(/e?$/, "ed")}.`,
        );
        continue;
      }
      const wanted = (c.to ?? "")
        .split(";")
        .map((p) => p.trim())
        .filter(Boolean);
      const picked = wanted.map((w) =>
        h.options.find((o) => normalize(o) === normalize(w)),
      );
      if (
        wanted.length === 0 ||
        picked.some((p) => !p) ||
        (!h.multiple && picked.length > 1)
      ) {
        problems.push(
          `${h.name}: change to what? ${h.options.length ? `Options: ${h.options.join(", ")}${h.multiple ? " (several allowed)" : ""}.` : "It has no options."}`,
        );
        continue;
      }
      const to = picked.join("; ");
      if (normalize(to) === normalize(h.current ?? "")) {
        problems.push(`${h.name} is already ${to}.`);
        continue;
      }
      value = { action: h.changeAction, value: to };
    }
    suggestions.push({
      kind: "held",
      target: `held:${h.inventoryId}`,
      value,
      ...(c.reason?.trim() && { reason: c.reason.trim().slice(0, 200) }),
    });
  }
  return { suggestions, problems };
}

/** New items for an access change (Grant / Issue), never what they hold. */
export function addedSuggestions(
  add: AccessChangeInput["add"],
  held: HeldItem[],
  options: FormOptions,
): { suggestions: Suggestion[]; problems: string[] } {
  if (!add) return { suggestions: [], problems: [] };
  const problems: string[] = [];
  const holdsApp = (name: string) =>
    held.some(
      (h) => h.kind === "application" && normalize(h.name) === normalize(name),
    );
  for (const a of add.applications ?? []) {
    if (holdsApp(a.name))
      problems.push(
        `They already hold ${a.name}: change its role instead (a change, not something new).`,
      );
  }
  const resolved = resolveOnboarding(
    {
      applications: add.applications,
      equipment: add.equipment,
      access: add.access,
    },
    options,
  );
  if (!resolved.ok) problems.push(...resolved.problems);
  return {
    suggestions: resolved.ok && !problems.length ? resolved.suggestions : [],
    problems,
  };
}

export type ResolvedAccessChange =
  | { ok: true; leaver: Leaver; suggestions: Suggestion[] }
  | { ok: false; problems: string[] };

/** Step 1 (before the person's items are read): who, and may they change. */
export function accessChangePerson(
  leavers: Leaver[],
  person: string,
): { leaver: Leaver } | { problem: string } {
  const found = findLeaver(leavers, person);
  if ("problem" in found) return found;
  const blocked = blockedReason(found.leaver, "access_modification");
  return blocked
    ? {
        problem: `${found.leaver.name}: ${blocked}.${blocked.startsWith("Access change") ? " Offer to add to that one instead (suggestValues with its ticket)." : ""}`,
      }
    : found;
}

/** Step 2: everything as suggestions, or the problems. */
export function resolveAccessChange(
  input: AccessChangeInput,
  leaver: Leaver,
  held: HeldItem[],
  options: FormOptions,
): ResolvedAccessChange {
  const changes = heldSuggestions(input.changes ?? [], held);
  const added = addedSuggestions(input.add, held, options);
  const problems = [...changes.problems, ...added.problems];
  const out = [...changes.suggestions, ...added.suggestions];
  const day = input.effectiveDate?.trim();
  if (day) {
    if (!DAY.test(day))
      problems.push("The effective date must be a day like 2026-11-01.");
    else {
      const why = input.reasons?.effectiveDate?.trim().slice(0, 200);
      out.push({
        kind: "field",
        target: "effective_date",
        value: day,
        ...(why && { reason: why }),
      });
    }
  }
  return problems.length
    ? { ok: false, problems }
    : { ok: true, leaver, suggestions: out };
}
