import { zonedParts, zonedToIso } from "@/lib/time/zoned";

/** The five "What happened" groups (database: private.audit_group()). */
export const AUDIT_GROUPS = [
  "requests",
  "signatures",
  "records",
  "admin",
  "accounts",
] as const;
export type AuditGroup = (typeof AUDIT_GROUPS)[number];

export const GROUP_LABELS: Record<AuditGroup, { label: string; note: string }> =
  {
    requests: {
      label: "Requests",
      note: "Created, details changed, apps / devices / access, started, cancelled",
    },
    signatures: {
      label: "Signatures & approvals",
      note: "Review & sign, confirmed, returned, signature uploads",
    },
    records: {
      label: "Records & PDFs",
      note: "PDF made, downloads, exports",
    },
    admin: {
      label: "Admin & catalog",
      note: "Applications, types, settings, users and roles",
    },
    accounts: {
      label: "Sign-in & accounts",
      note: "Sign-in, sign-out, password, authenticator, timezone",
    },
  };

/** Source pills: People = "user" in the database. */
export const AUDIT_SOURCES = ["people", "ai", "system"] as const;
export type AuditSourceFilter = (typeof AUDIT_SOURCES)[number];
export const SOURCE_LABELS: Record<AuditSourceFilter, string> = {
  people: "People",
  ai: "AI",
  system: "System",
};
export const SOURCE_TO_DB = {
  people: "user",
  ai: "ai",
  system: "system",
} as const;

export const AUDIT_PERIODS = ["today", "7d", "30d", "all"] as const;
export type AuditPeriod = (typeof AUDIT_PERIODS)[number];
export const PERIOD_LABELS: Record<AuditPeriod, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  all: "All",
};

export const AUDIT_PAGE_SIZE = 30;

export type AuditFilters = {
  q: string;
  source: AuditSourceFilter | null;
  /** A Clerk user ID, "system", or null for everyone. */
  who: string | null;
  groups: AuditGroup[];
  /** Ignored when `from` or `to` is set. */
  period: AuditPeriod;
  /** Days ("2026-10-01") in the viewer's timezone, both inclusive. */
  from: string | null;
  to: string | null;
  /** "Hide the test users" — on unless switched off. */
  hideTests: boolean;
};

export const DEFAULT_AUDIT_FILTERS: AuditFilters = {
  q: "",
  source: null,
  who: null,
  groups: [],
  period: "7d",
  from: null,
  to: null,
  hideTests: true,
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (value: string) =>
  DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    ? value
    : null;

/**
 * Reads the filters from the URL (?q=&source=&who=&groups=&period=&from=&to=
 * &tests=show); anything unknown falls back to the default, so a link can be
 * bookmarked and shared.
 */
export function parseAuditFilters(params: SearchParams): AuditFilters {
  const source = first(params.source);
  const who = first(params.who);
  const period = first(params.period);
  return {
    q: first(params.q).slice(0, 100),
    source: AUDIT_SOURCES.includes(source as AuditSourceFilter)
      ? (source as AuditSourceFilter)
      : null,
    who: who === "system" || /^user_\w{1,64}$/.test(who) ? who : null,
    groups: AUDIT_GROUPS.filter((g) =>
      first(params.groups).split(",").includes(g),
    ),
    period: AUDIT_PERIODS.includes(period as AuditPeriod)
      ? (period as AuditPeriod)
      : DEFAULT_AUDIT_FILTERS.period,
    from: validDay(first(params.from)),
    to: validDay(first(params.to)),
    hideTests: first(params.tests) !== "show",
  };
}

/** The filters as URL parameters, leaving out the defaults. */
export function auditParams(filters: AuditFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.source) params.set("source", filters.source);
  if (filters.who) params.set("who", filters.who);
  if (filters.groups.length) params.set("groups", filters.groups.join(","));
  if (filters.from || filters.to) {
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
  } else if (filters.period !== DEFAULT_AUDIT_FILTERS.period) {
    params.set("period", filters.period);
  }
  if (!filters.hideTests) params.set("tests", "show");
  return params;
}

/** "2026-10-15" + n days. */
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The time range to ask the database for: from (inclusive) … to (exclusive),
 * days counted in the viewer's timezone. "7 days" = today and the 6 before.
 */
export function auditRange(
  filters: AuditFilters,
  timeZone: string,
  now: Date = new Date(),
): { from: string | null; to: string | null } {
  if (filters.from || filters.to) {
    return {
      from: filters.from ? zonedToIso(filters.from, "00:00", timeZone) : null,
      to: filters.to
        ? zonedToIso(addDays(filters.to, 1), "00:00", timeZone)
        : null,
    };
  }
  if (filters.period === "all") return { from: null, to: null };
  const today = zonedParts(now.toISOString(), timeZone).date;
  const back = { today: 0, "7d": 6, "30d": 29 }[filters.period];
  return {
    from: zonedToIso(addDays(today, -back), "00:00", timeZone),
    to: null,
  };
}

/** "1 Oct 2026" from "2026-10-01". */
function shortDay(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

export type FilterChip = { label: string; clear: Partial<AuditFilters> };

/**
 * The active filters as removable chips ("Last 7 days ×", "Hiding test
 * users ×"). Search and source have their own controls above, so no chip.
 */
export function filterChips(
  filters: AuditFilters,
  people: Record<string, string>,
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.who) {
    chips.push({
      label:
        filters.who === "system" ? "System" : (people[filters.who] ?? "Person"),
      clear: { who: null },
    });
  }
  for (const group of filters.groups) {
    chips.push({
      label: GROUP_LABELS[group].label,
      clear: { groups: filters.groups.filter((g) => g !== group) },
    });
  }
  if (filters.from || filters.to) {
    const label =
      filters.from && filters.to
        ? `${shortDay(filters.from)} – ${shortDay(filters.to)}`
        : filters.from
          ? `From ${shortDay(filters.from)}`
          : `Until ${shortDay(filters.to!)}`;
    chips.push({ label, clear: { from: null, to: null, period: "all" } });
  } else if (filters.period !== "all") {
    chips.push({
      label:
        filters.period === "today"
          ? "Today"
          : `Last ${filters.period === "7d" ? "7" : "30"} days`,
      clear: { period: "all" },
    });
  }
  if (filters.hideTests) {
    chips.push({ label: "Hiding test users", clear: { hideTests: false } });
  }
  return chips;
}
