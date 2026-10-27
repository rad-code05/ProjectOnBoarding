import { blockedReason, type Leaver } from "@/lib/requests/leavers-shared";
import { TIMELINE_LABELS, type SlaTimeline } from "@/lib/requests/offboarding";
import { zonedToIso } from "@/lib/time/zoned";
import { normalize } from "./people-shared";
import type { Suggestion } from "./onboarding-shared";

/**
 * Starting an offboarding by chat (F16d-1, pure). The person must be someone
 * who holds something today (the access inventory) with no offboarding open;
 * their removals are pre-filled by the database when the draft is created.
 * The SLA set-up and the handover arrive as suggestions. Nothing is guessed:
 * an unknown or ambiguous person is a problem, with who matches.
 */

export const OFFBOARDING_TOPICS = {
  lastWorkingDay: "last working day",
  slaTimeline: "SLA (same day, within 24 h or within 48 h)",
  cutoff: "access cut-off (date and time)",
  handoverTo: "handover (who gets their data and mailbox)",
} as const;
export type OffboardingTopic = keyof typeof OFFBOARDING_TOPICS;

export type OffboardingInput = {
  /** Name or work email, as the person said it. */
  person: string;
  lastWorkingDay?: string;
  slaTimeline?: SlaTimeline;
  cutoffDate?: string;
  /** "18:00", company time. */
  cutoffTime?: string;
  handoverTo?: string;
  /** Only the handover can be "not needed". */
  notNeeded?: "handoverTo"[];
  reasons?: Partial<Record<OffboardingTopic, string>>;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const text = (v?: string) => v?.trim() || undefined;

/** Topics nobody answered yet. */
export function missingOffboardingTopics(
  input: OffboardingInput,
): OffboardingTopic[] {
  const missing: OffboardingTopic[] = [];
  if (!text(input.lastWorkingDay)) missing.push("lastWorkingDay");
  if (!input.slaTimeline) missing.push("slaTimeline");
  if (!text(input.cutoffDate) || !text(input.cutoffTime))
    missing.push("cutoff");
  if (!text(input.handoverTo) && !input.notNeeded?.includes("handoverTo"))
    missing.push("handoverTo");
  return missing;
}

export function askAboutOffboarding(input: OffboardingInput): string | null {
  const missing = missingOffboardingTopics(input);
  return missing.length
    ? `Not shown to the person yet. Ask about: ${missing.map((t) => OFFBOARDING_TOPICS[t]).join(", ")} — in one short numbered list. Then call again.`
    : null;
}

/** The one person meant — by email, else by name (all words, any order). */
export function findLeaver(
  leavers: Leaver[],
  person: string,
): { leaver: Leaver } | { problem: string } {
  const q = normalize(person);
  const byEmail = leavers.filter((l) => normalize(l.email) === q);
  const words = q.split(" ").filter(Boolean);
  const matches = byEmail.length
    ? byEmail
    : leavers.filter((l) => {
        const name = normalize(l.name);
        return words.every((w) => name.includes(w));
      });
  if (matches.length === 1) return { leaver: matches[0] };
  if (matches.length === 0)
    return {
      problem: `Nobody called "${person}" holds anything on record (an offboarding starts from what the person holds). Ask for the full name or work email.`,
    };
  return {
    problem: `Several people match "${person}": ${matches
      .slice(0, 8)
      .map((l) => `${l.name} (${l.email})`)
      .join(", ")}. Ask which one.`,
  };
}

export type ResolvedOffboarding =
  | { ok: true; leaver: Leaver; suggestions: Suggestion[] }
  | { ok: false; problems: string[] };

export function resolveOffboarding(
  input: OffboardingInput,
  leavers: Leaver[],
  companyTimeZone: string,
): ResolvedOffboarding {
  const problems: string[] = [];
  const found = findLeaver(leavers, input.person);
  if ("problem" in found) problems.push(found.problem);
  else {
    const blocked = blockedReason(found.leaver, "offboarding");
    if (blocked)
      problems.push(
        `${found.leaver.name}: ${blocked}. Offer to add to that one instead (suggestValues with its ticket).`,
      );
  }

  const fields = offboardingFields(input, companyTimeZone);
  problems.push(...fields.problems);
  return problems.length || "problem" in found
    ? { ok: false, problems }
    : { ok: true, leaver: found.leaver, suggestions: fields.suggestions };
}

/**
 * The timing and handover as suggestions (also for an offboarding that
 * already exists — suggestValues). Dates checked; the cut-off in company time.
 */
export function offboardingFields(
  input: Omit<OffboardingInput, "person">,
  companyTimeZone: string,
): { suggestions: Suggestion[]; problems: string[] } {
  const problems: string[] = [];
  const why = (t: OffboardingTopic) => input.reasons?.[t]?.trim().slice(0, 200);
  const out: Suggestion[] = [];
  const add = (topic: OffboardingTopic, target: string, value: unknown) =>
    out.push(
      why(topic)
        ? { kind: "field", target, value, reason: why(topic) }
        : { kind: "field", target, value },
    );

  if (input.slaTimeline) add("slaTimeline", "sla_timeline", input.slaTimeline);
  const last = text(input.lastWorkingDay);
  if (last) {
    if (!DAY.test(last))
      problems.push("The last working day must be a day like 2026-10-30.");
    else add("lastWorkingDay", "last_working_day", last);
  }
  const date = text(input.cutoffDate);
  const time = text(input.cutoffTime);
  if (date || time) {
    if (!date || !DAY.test(date) || !time || !TIME.test(time))
      problems.push(
        "The access cut-off needs a day like 2026-10-30 and a time like 18:00 (company time).",
      );
    else
      add(
        "cutoff",
        "access_cutoff_at",
        zonedToIso(date, time, companyTimeZone),
      );
  }
  const handover = text(input.handoverTo);
  if (handover) add("handoverTo", "handover_to", handover);
  return { suggestions: out, problems };
}

export const timelineLabel = (t: unknown): string | null =>
  typeof t === "string" && t in TIMELINE_LABELS
    ? TIMELINE_LABELS[t as SlaTimeline]
    : null;
