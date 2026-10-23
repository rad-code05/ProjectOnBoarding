import * as z from "zod";
import {
  DEFAULT_REPORT_FILTERS,
  type ReportFilters,
} from "@/lib/reports/filters";
import { COUNTRY_CODES } from "@/lib/requests/countries";
import { countryName } from "@/lib/requests/labels";

/** The reports the assistant can run (F15d) — the same ones as the Reports page. */
export const AI_REPORTS = [
  "onboarded",
  "employees_by_office",
  "all_users",
  "signature_log",
  "offboarding_sla",
  "access_by_application",
  "open_requests",
] as const;
export type AiReport = (typeof AI_REPORTS)[number];

const name = z.string().trim().min(1).max(80);

/** What the model may ask for — names in plain words, resolved on the server. */
export const reportInput = z.object({
  report: z
    .enum(AI_REPORTS)
    .describe(
      "onboarded = onboardings the approver closed in the period (D16); employees_by_office = headcount today; all_users = requests created in the period; signature_log = IT signed / approver confirmed, time to approve; offboarding_sla = access-removal deadlines met / missed; access_by_application = who holds an application, device or access today; open_requests = what waits right now, by status.",
    ),
  groupBy: z
    .enum(["month", "country", "department", "office"])
    .optional()
    .describe(
      "onboarded only: per month (default), country, department or office.",
    ),
  period: z
    .enum(["this_month", "last_3_months", "last_12_months", "all_time"])
    .optional()
    .describe(
      "Default last_12_months. Ignored by employees_by_office, access_by_application and open_requests (they are today / right now).",
    ),
  from: z.iso
    .date()
    .optional()
    .describe("First day, YYYY-MM-DD (company timezone); overrides period."),
  to: z.iso
    .date()
    .optional()
    .describe("Last day, YYYY-MM-DD (company timezone); overrides period."),
  requestType: z
    .enum(["onboarding", "offboarding", "access_modification"])
    .optional(),
  office: name.optional().describe('Office name, e.g. "Dubai", or "not set".'),
  state: name.optional().describe("US state, e.g. Texas (needs office US)."),
  city: name.optional().describe("City, e.g. Austin (needs a state)."),
  country: name
    .optional()
    .describe(
      'Country people work in: name or ISO code, e.g. "United Arab Emirates" or "AE".',
    ),
  department: name.optional(),
  nationality: name
    .optional()
    .describe('Country name or ISO code, or "not set".'),
  accessKind: z
    .enum(["application", "equipment", "access"])
    .optional()
    .describe("access_by_application only (default application)."),
  item: name
    .optional()
    .describe(
      'access_by_application only: one application / device / access, e.g. "Figma" — returns who holds it.',
    ),
});
export type ReportInput = z.infer<typeof reportInput>;

/** The filter lists the names are matched against (loadReportOptions). */
export type FilterLists = {
  departments: { id: number; name: string }[];
  offices: { id: number; name: string }[];
  regions: { id: number; name: string }[];
  cities: { id: number; regionId: number; officeId: number; name: string }[];
};

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const NOT_SET = new Set(["not set", "none", "no office", "unknown", "empty"]);
const COUNTRY_ALIASES: Record<string, string> = {
  us: "US",
  usa: "US",
  "united states of america": "US",
  america: "US",
  uae: "AE",
  emirates: "AE",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
};

/** "UAE", "United Arab Emirates", "ae" → "AE"; null when unknown. */
export function countryCode(text: string): string | null {
  const t = fold(text);
  if (COUNTRY_ALIASES[t]) return COUNTRY_ALIASES[t];
  const upper = text.trim().toUpperCase();
  if ((COUNTRY_CODES as readonly string[]).includes(upper)) return upper;
  return (
    COUNTRY_CODES.find((c) => fold(countryName(c)) === t) ??
    COUNTRY_CODES.find(
      (c) => fold(countryName(c)).startsWith(t) && t.length >= 4,
    ) ??
    null
  );
}

const byName = <T extends { name: string }>(list: T[], text: string) =>
  list.find((x) => fold(x.name) === fold(text));

/**
 * The model's words → the Reports page's filters. Names that match nothing
 * are reported back (the model says so instead of guessing a number).
 */
export function resolveReportFilters(
  input: ReportInput,
  lists: FilterLists,
): { filters: ReportFilters; unknown: string[] } {
  const unknown: string[] = [];
  const f: ReportFilters = { ...DEFAULT_REPORT_FILTERS, limit: 20 };

  if (input.from || input.to) {
    f.from = input.from ?? null;
    f.to = input.to ?? null;
  } else {
    f.period = (
      {
        this_month: "month",
        last_3_months: "3m",
        last_12_months: "12m",
        all_time: "all",
      } as const
    )[input.period ?? "last_12_months"];
  }
  if (input.requestType) f.type = input.requestType;

  if (input.office) {
    if (NOT_SET.has(fold(input.office))) f.office = 0;
    else {
      const o = byName(lists.offices, input.office);
      if (o) f.office = o.id;
      else unknown.push(`office "${input.office}"`);
    }
  }
  if (input.state) {
    const r = byName(lists.regions, input.state);
    if (r && f.office) f.region = r.id;
    else
      unknown.push(
        `state "${input.state}"${r ? " (choose the US office too)" : ""}`,
      );
  }
  if (input.city) {
    const c = lists.cities.find(
      (x) =>
        fold(x.name) === fold(input.city!) &&
        (!f.region || x.regionId === f.region),
    );
    if (c && f.region) f.city = c.id;
    else
      unknown.push(`city "${input.city}"${c ? " (choose its state too)" : ""}`);
  }
  if (input.country) {
    const code = countryCode(input.country);
    if (code) f.country = code;
    else unknown.push(`country "${input.country}"`);
  }
  if (input.department) {
    const d = byName(lists.departments, input.department);
    if (d) f.department = d.id;
    else unknown.push(`department "${input.department}"`);
  }
  if (input.nationality) {
    if (NOT_SET.has(fold(input.nationality))) f.nationality = "none";
    else {
      const code = countryCode(input.nationality);
      if (code) f.nationality = code;
      else unknown.push(`nationality "${input.nationality}"`);
    }
  }
  return { filters: f, unknown };
}

/** "5 h", "2 d 3 h", "40 min". */
export function duration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}
