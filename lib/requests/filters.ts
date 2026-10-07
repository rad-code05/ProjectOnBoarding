import {
  REQUEST_STATES,
  REQUEST_TYPES,
  type RequestState,
  type RequestType,
} from "./labels";

export const PAGE_SIZE = 20;
const MAX_LIMIT = 500;

export type RequestFilters = {
  /** Free text: every word must match a name, email or ticket ID. */
  q: string;
  type: RequestType | null;
  status: RequestState | null;
  country: string | null;
  /** How many rows to show ("Show more" adds a page). */
  limit: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

/** Reads the list filters from the URL; anything unknown is ignored. */
export function parseFilters(params: SearchParams): RequestFilters {
  const type = first(params.type);
  const status = first(params.status);
  const country = first(params.country).toUpperCase();
  const limit = Number.parseInt(first(params.limit), 10);
  return {
    q: first(params.q).slice(0, 100),
    type: REQUEST_TYPES.includes(type as RequestType)
      ? (type as RequestType)
      : null,
    status: REQUEST_STATES.includes(status as RequestState)
      ? (status as RequestState)
      : null,
    country: /^[A-Z]{2}$/.test(country) ? country : null,
    limit: Number.isFinite(limit)
      ? Math.min(Math.max(limit, PAGE_SIZE), MAX_LIMIT)
      : PAGE_SIZE,
  };
}

/** Search words, stripped of characters that have a meaning in filters. */
export function searchTerms(q: string): string[] {
  return q
    .replace(/[,()*%\\]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
}

/** True when any filter is active (an empty result then means "no match"). */
export function hasActiveFilters(filters: RequestFilters): boolean {
  return Boolean(
    filters.q || filters.type || filters.status || filters.country,
  );
}
