import type { Role } from "@/lib/auth";
import { SECTIONS } from "@/lib/requests/sections";
import { OPEN_STATES } from "./people-shared";

/**
 * Pure helpers for the request tools (F15d-2b): reading a ticket the way
 * people type it, where a request opens, and what "missing" means.
 */

/**
 * "UAM-2026-000375", "uam 2026 375", "2026-375" or just "375" → what to look
 * for. Without a year, every year's ticket with that number matches.
 */
export function parseTicket(
  text: string,
): { year: number | null; number: number } | null {
  const digits = text.match(/\d+/g);
  if (!digits) return null;
  if (digits.length === 1) {
    const n = Number(digits[0]);
    return n > 0 ? { year: null, number: n } : null;
  }
  const [year, number] = digits.slice(-2).map(Number);
  return year >= 2000 && year <= 2100 && number > 0 ? { year, number } : null;
}

/** Where the request opens in the app: closed ones as a record. */
export function requestLink(id: string, state: string): string {
  return state === "closed" ? `/records/${id}` : `/requests/${id}`;
}

/** Only IT signs section 9, so only IT gets the Review & sign checks. */
export function canCheckSigning(roles: readonly Role[]): boolean {
  return roles.some((r) => r === "admin" || r === "it_operator");
}

/** Requests whose missing fields still matter (not closed, not cancelled). */
export function isOpen(state: string): boolean {
  return (OPEN_STATES as readonly string[]).includes(state);
}

/** [5, 9] → ["5 · Application access", "9 · IT execution confirmation"]. */
export function sectionNames(numbers: readonly number[]): string[] {
  return numbers.flatMap((n) => {
    const s = SECTIONS.find((x) => x.number === n);
    return s ? [`${s.number} · ${s.title}`] : [];
  });
}
