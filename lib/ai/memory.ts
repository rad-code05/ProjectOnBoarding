import { REPORTS, type ReportSlug } from "@/lib/reports/catalog";
import { normalize } from "./tools/people-shared";

/**
 * What the assistant remembers about a person (PROJECT_PLAN §6.6, decided
 * 2026-10-23) — pure rules, no database:
 * - the name to use, only when the person asks ("call me Raj");
 * - favourite reports: the last 5 reports the robot ran for them;
 * - frequent questions: a short, general version of what they asked — no
 *   people's names, emails or tickets, at most 80 characters, the last 5.
 * Never the chat text itself.
 */

export const MEMORY_SIZE = 5;
export const QUESTION_LENGTH = 80;
export const CALL_ME_LENGTH = 40;

/** Put `item` first, without repeats (case doesn't matter), at most 5. */
export function addRecent(list: readonly string[], item: string): string[] {
  const key = item.toLowerCase();
  return [item, ...list.filter((x) => x.toLowerCase() !== key)].slice(
    0,
    MEMORY_SIZE,
  );
}

const EMAIL = /[^\s@]+@[^\s@]+/;
const TICKET = /\bUAM[-\s]?\d{4}/i;
const URL = /https?:|www\.|\/\w+\//i;

/**
 * A question fit for memory, or null: one line, at most 80 characters, no
 * email, ticket or link (those are about one person or one request).
 */
export function cleanQuestion(text: string): string | null {
  const q = text.replace(/\s+/g, " ").trim();
  if (q.length < 8 || q.length > QUESTION_LENGTH) return null;
  if (EMAIL.test(q) || TICKET.test(q) || URL.test(q)) return null;
  return /[?.!]$/.test(q) ? q : `${q}?`;
}

/**
 * Does the question name someone? Full names ("rose bernal") of the people
 * the app knows, case and accents ignored.
 */
export function namesSomeone(
  question: string,
  fullNames: readonly string[],
): boolean {
  const q = normalize(question);
  return fullNames.some((n) => {
    const name = normalize(n);
    return name.includes(" ") && q.includes(name);
  });
}

/** The name to use: 1–40 characters, letters, spaces, - ' . only. */
export function cleanCallMe(text: string): string | null {
  const name = text.replace(/\s+/g, " ").trim();
  if (!name || name.length > CALL_ME_LENGTH) return null;
  return /^[\p{L}][\p{L}\p{M} '.-]*$/u.test(name) ? name : null;
}

/** "/reports/signature-log?period=month" → "signature-log" (a real report only). */
export function reportFromLink(link: unknown): ReportSlug | null {
  if (typeof link !== "string") return null;
  const slug = link.match(/^\/reports\/([a-z-]+)/)?.[1];
  return REPORTS.find((r) => r.slug === slug)?.slug ?? null;
}

/** Saved slugs → report names, unknown ones dropped ("Signature log"). */
export function favouriteReportNames(slugs: readonly string[]): string[] {
  return slugs.flatMap((s) => {
    const r = REPORTS.find((x) => x.slug === s);
    return r ? [r.name] : [];
  });
}
