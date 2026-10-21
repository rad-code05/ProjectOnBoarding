import {
  REQUEST_TYPES,
  TYPE_LABELS,
  countryName,
  type RequestType,
} from "@/lib/requests/labels";
import { zonedParts, zonedToIso } from "@/lib/time/zoned";

/** Board: Month / 3 months / 12 months / Dates — plus "all" when cleared. */
export const REPORT_PERIODS = ["month", "3m", "12m", "all"] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];
export const PERIOD_LABELS: Record<Exclude<ReportPeriod, "all">, string> = {
  month: "Month",
  "3m": "3 months",
  "12m": "12 months",
};

export const REPORT_PAGE_SIZE = 20;
const MAX_LIMIT = 500;

export type ReportFilters = {
  q: string;
  /** Ignored when `from` or `to` is set. */
  period: ReportPeriod;
  /** Days ("2026-10-01") in the company timezone, both inclusive. */
  from: string | null;
  to: string | null;
  type: RequestType | null;
  country: string | null;
  department: number | null;
  /** Office id; 0 = "Not set" (requests from before form v4.2). */
  office: number | null;
  /** US state id (only with an office that asks for a state). */
  region: number | null;
  /** City id (only with a state). */
  city: number | null;
  /** Nationality ISO code, or "none" = "Not set"; two nationalities match either. */
  nationality: string | null;
  /** How many rows to show ("Show 20 more" adds a page). */
  limit: number;
};

export const DEFAULT_REPORT_FILTERS: ReportFilters = {
  q: "",
  period: "12m",
  from: null,
  to: null,
  type: null,
  country: null,
  department: null,
  office: null,
  region: null,
  city: null,
  nationality: null,
  limit: REPORT_PAGE_SIZE,
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

const validDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    ? value
    : null;

/** Reads the filters from the URL; anything unknown falls back to the default. */
export function parseReportFilters(params: SearchParams): ReportFilters {
  const period = first(params.period);
  const type = first(params.type);
  const country = first(params.country).toUpperCase();
  const department = Number.parseInt(first(params.department), 10);
  const limit = Number.parseInt(first(params.limit), 10);
  const office = Number.parseInt(first(params.office), 10);
  const region = Number.parseInt(first(params.state), 10);
  const city = Number.parseInt(first(params.city), 10);
  const nationality = first(params.nationality);
  const validOffice =
    Number.isInteger(office) && office >= 0 && office < 32768 ? office : null;
  // A state only under a chosen office, a city only under a state.
  const validRegion =
    validOffice && Number.isInteger(region) && region > 0 && region < 32768
      ? region
      : null;
  const validCity =
    validRegion && Number.isInteger(city) && city > 0 && city < 2 ** 31
      ? city
      : null;
  return {
    q: first(params.q).slice(0, 100),
    period: REPORT_PERIODS.includes(period as ReportPeriod)
      ? (period as ReportPeriod)
      : DEFAULT_REPORT_FILTERS.period,
    from: validDay(first(params.from)),
    to: validDay(first(params.to)),
    type: REQUEST_TYPES.includes(type as RequestType)
      ? (type as RequestType)
      : null,
    country: /^[A-Z]{2}$/.test(country) ? country : null,
    department:
      Number.isInteger(department) && department > 0 && department < 32768
        ? department
        : null,
    office: validOffice,
    region: validRegion,
    city: validCity,
    nationality:
      nationality === "none"
        ? "none"
        : /^[A-Z]{2}$/.test(nationality.toUpperCase())
          ? nationality.toUpperCase()
          : null,
    limit: Number.isFinite(limit)
      ? Math.min(Math.max(limit, REPORT_PAGE_SIZE), MAX_LIMIT)
      : REPORT_PAGE_SIZE,
  };
}

/** The filters as URL parameters, leaving out the defaults (and the page size). */
export function reportParams(filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.from || filters.to) {
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
  } else if (filters.period !== DEFAULT_REPORT_FILTERS.period) {
    params.set("period", filters.period);
  }
  if (filters.type) params.set("type", filters.type);
  if (filters.country) params.set("country", filters.country);
  if (filters.department) params.set("department", String(filters.department));
  if (filters.office !== null) {
    params.set("office", String(filters.office));
    if (filters.office && filters.region) {
      params.set("state", String(filters.region));
      if (filters.city) params.set("city", String(filters.city));
    }
  }
  if (filters.nationality) params.set("nationality", filters.nationality);
  return params;
}

/** "2026-10-15" + n months (end of shorter months clamps). */
function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/**
 * The days a report covers, in the company timezone (reports never use a
 * person's own timezone): first and last day, both inclusive, or null.
 * "12 months" on 15 Oct 2026 = 16 Oct 2025 – 15 Oct 2026.
 */
export function reportDays(
  filters: ReportFilters,
  timeZone: string,
  now: Date = new Date(),
): { first: string | null; last: string | null } {
  if (filters.from || filters.to) {
    return { first: filters.from, last: filters.to };
  }
  const today = zonedParts(now.toISOString(), timeZone).date;
  switch (filters.period) {
    case "month":
      return { first: `${today.slice(0, 7)}-01`, last: today };
    case "3m":
      return { first: addDays(addMonths(today, -3), 1), last: today };
    case "12m":
      return { first: addDays(addMonths(today, -12), 1), last: today };
    default:
      return { first: null, last: null };
  }
}

/** The same days as instants for the database: from (inclusive) … to (exclusive). */
export function reportRange(
  filters: ReportFilters,
  timeZone: string,
  now: Date = new Date(),
): { from: string | null; to: string | null } {
  const days = reportDays(filters, timeZone, now);
  return {
    from: days.first ? zonedToIso(days.first, "00:00", timeZone) : null,
    to: days.last ? zonedToIso(addDays(days.last, 1), "00:00", timeZone) : null,
  };
}

/** "1 Oct 2026" from "2026-10-01". */
export function shortDay(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

/** "16 Oct 2025 – 15 Oct 2026", "From 1 Oct 2026", "All time". */
export function rangeLabel(days: {
  first: string | null;
  last: string | null;
}): string {
  if (days.first && days.last)
    return `${shortDay(days.first)} – ${shortDay(days.last)}`;
  if (days.first) return `From ${shortDay(days.first)}`;
  if (days.last) return `Until ${shortDay(days.last)}`;
  return "All time";
}

export type ReportChip = { label: string; clear: Partial<ReportFilters> };

/** Names for the ids in the filters (departments, offices, states, cities). */
export type ReportNames = {
  departments?: Record<number, string>;
  offices?: Record<number, string>;
  regions?: Record<number, string>;
  cities?: Record<number, string>;
};

/** The names from the filter options (`loadReportOptions`). */
export function reportNames(options: {
  departments: { id: number; name: string }[];
  offices?: { id: number; name: string }[];
  regions?: { id: number; name: string }[];
  cities?: { id: number; name: string }[];
}): ReportNames {
  const byId = (list: { id: number; name: string }[] = []) =>
    Object.fromEntries(list.map((x) => [x.id, x.name]));
  return {
    departments: byId(options.departments),
    offices: byId(options.offices),
    regions: byId(options.regions),
    cities: byId(options.cities),
  };
}

/** "Dubai", "Office not set", "Texas", "Austin", "Nationality: Switzerland". */
function placeLabels(filters: ReportFilters, names: ReportNames) {
  const labels: {
    key: "office" | "region" | "city" | "nationality";
    label: string;
    words: string;
  }[] = [];
  if (filters.office !== null) {
    const name =
      filters.office === 0
        ? "Not set"
        : (names.offices?.[filters.office] ?? "Office");
    labels.push({
      key: "office",
      label: filters.office === 0 ? "Office not set" : name,
      words: `Office: ${name}`,
    });
  }
  if (filters.region) {
    const name = names.regions?.[filters.region] ?? "State";
    labels.push({ key: "region", label: name, words: `State: ${name}` });
  }
  if (filters.city) {
    const name = names.cities?.[filters.city] ?? "City";
    labels.push({ key: "city", label: name, words: `City: ${name}` });
  }
  if (filters.nationality) {
    const name =
      filters.nationality === "none"
        ? "Not set"
        : countryName(filters.nationality);
    labels.push({
      key: "nationality",
      label:
        filters.nationality === "none"
          ? "Nationality not set"
          : `Nationality: ${name}`,
      words: `Nationality: ${name}`,
    });
  }
  return labels;
}

/** What removing a place chip clears (an office takes its state and city along). */
const PLACE_CLEAR: Record<string, Partial<ReportFilters>> = {
  office: { office: null, region: null, city: null },
  region: { region: null, city: null },
  city: { city: null },
  nationality: { nationality: null },
};

/** Active filters as removable chips ("Last 12 months ×", "Sales ×"). */
export function reportChips(
  filters: ReportFilters,
  names: ReportNames = {},
): ReportChip[] {
  const departments = names.departments ?? {};
  const chips: ReportChip[] = [];
  if (filters.from || filters.to) {
    chips.push({
      label: rangeLabel({ first: filters.from, last: filters.to }),
      clear: { from: null, to: null, period: "all" },
    });
  } else if (filters.period !== "all") {
    chips.push({
      label:
        filters.period === "month"
          ? "This month"
          : `Last ${filters.period === "3m" ? "3" : "12"} months`,
      clear: { period: "all" },
    });
  }
  if (filters.type) {
    chips.push({ label: TYPE_LABELS[filters.type], clear: { type: null } });
  }
  if (filters.country) {
    chips.push({
      label: countryName(filters.country),
      clear: { country: null },
    });
  }
  if (filters.department) {
    chips.push({
      label: departments[filters.department] ?? "Department",
      clear: { department: null },
    });
  }
  for (const place of placeLabels(filters, names)) {
    chips.push({ label: place.label, clear: PLACE_CLEAR[place.key] });
  }
  return chips;
}

/** The active filters in words, for a PDF ("Type: Onboarding", "Country: Switzerland"). */
export function filterWords(
  filters: ReportFilters,
  names: ReportNames = {},
): string[] {
  const departments = names.departments ?? {};
  const words: string[] = [];
  if (filters.type) words.push(`Type: ${TYPE_LABELS[filters.type]}`);
  if (filters.country) words.push(`Country: ${countryName(filters.country)}`);
  if (filters.department) {
    words.push(`Department: ${departments[filters.department] ?? "—"}`);
  }
  for (const place of placeLabels(filters, names)) words.push(place.words);
  if (filters.q) words.push(`Search: "${filters.q}"`);
  return words;
}

/** The place filters (F27d). */
export type PlaceKey = "office" | "region" | "city" | "nationality";

/** The office / state / city / nationality arguments every report function takes (F27d). */
export function placeArgs(filters: Pick<ReportFilters, PlaceKey>) {
  return {
    p_office: filters.office ?? undefined,
    p_region: filters.region ?? undefined,
    p_city: filters.city ?? undefined,
    p_nationality: filters.nationality ?? undefined,
  };
}
