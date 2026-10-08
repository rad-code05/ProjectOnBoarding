import type { Database } from "@/lib/supabase/database.types";

export type RequestType = Database["public"]["Enums"]["request_type"];
export type RequestState = Database["public"]["Enums"]["request_state"];

export const TYPE_LABELS: Record<RequestType, string> = {
  onboarding: "Onboarding",
  offboarding: "Offboarding",
  access_modification: "Access modification",
};

/** What people see; "pending_confirmation" reads as "Awaiting confirmation". */
export const STATE_LABELS: Record<RequestState, string> = {
  draft: "Draft",
  in_execution: "In execution",
  pending_confirmation: "Awaiting confirmation",
  returned: "Returned",
  closed: "Closed",
  cancelled: "Cancelled",
};

/** Section 2 "Employment event" — follows the ticket type. */
export const EMPLOYMENT_EVENTS: Record<RequestType, string> = {
  onboarding: "Start",
  offboarding: "Leave",
  access_modification: "Change",
};

export const REQUEST_TYPES = Object.keys(TYPE_LABELS) as RequestType[];
export const REQUEST_STATES = Object.keys(STATE_LABELS) as RequestState[];

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** "CH" → "Switzerland" (ISO 3166 code as stored on the request). */
export function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** "Anna" + "Keller" → "Anna Keller"; empty while a draft has no name yet. */
export function personName(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  return [first, last].filter(Boolean).join(" ").trim();
}
