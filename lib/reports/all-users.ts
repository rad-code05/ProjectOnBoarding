import "server-only";
import { formatDate, formatDay } from "@/lib/requests/format";
import {
  countryName,
  personName,
  type RequestState,
  type RequestType,
} from "@/lib/requests/labels";
import { nationalityText } from "@/lib/requests/signing";
import {
  createServerSupabaseClient,
  type ServerSupabase,
} from "@/lib/supabase/server";
import { placeArgs, reportRange, type ReportFilters } from "./filters";

/** One request in the All users list (board: Phone · All users list). */
export type AllUsersRow = {
  id: string;
  ticketId: string;
  type: RequestType;
  state: RequestState;
  name: string;
  email: string;
  department: string | null;
  country: string | null;
  /** "US · Texas · Austin" — office, then the US state and city (F27). */
  office: string | null;
  /** "Switzerland, Italy" (F27); null = not set. */
  nationality: string | null;
  /** "Effective 20 Oct 2026 · Closed 15 Oct 2026" (company timezone). */
  dates: string;
  /** Where the row opens for this reader; null = nothing to open. */
  href: string | null;
};

export type ReportOptions = {
  departments: { id: number; name: string }[];
  /** Country codes in use on the requests this reader may see. */
  countries: string[];
  /** Offices (retired ones too — old requests still name them). */
  offices: {
    id: number;
    name: string;
    country: string;
    usesRegions: boolean;
    active: boolean;
  }[];
  /** States of the countries whose office asks for one (US). */
  regions: { id: number; country: string; name: string }[];
  /** Cities per office and state. */
  cities: { id: number; officeId: number; regionId: number; name: string }[];
  /** Nationality codes in use on the requests this reader may see. */
  nationalities: string[];
};

const byCountryName = (a: string, b: string) =>
  countryName(a).localeCompare(countryName(b));

/** Departments, countries, offices, states, cities and nationalities for the filters sheet. */
export async function loadReportOptions(
  supabase: ServerSupabase = createServerSupabaseClient(),
): Promise<ReportOptions> {
  const [departments, countries, offices, regions, cities, nationalities] =
    await Promise.all([
      supabase.from("departments").select("id, name").order("sort_order"),
      supabase.from("requests").select("country").not("country", "is", null),
      supabase
        .from("offices")
        .select("id, name, country, uses_regions, active")
        .order("sort_order"),
      supabase
        .from("country_regions")
        .select("id, country, name")
        .order("name"),
      supabase
        .from("office_cities")
        .select("id, office_id, region_id, name")
        .order("name"),
      supabase
        .from("requests")
        .select("nationalities")
        .not("nationalities", "is", null),
    ]);
  if (
    departments.error ||
    countries.error ||
    offices.error ||
    regions.error ||
    cities.error ||
    nationalities.error
  ) {
    throw new Error("Could not load the report filters.");
  }
  const regionCountries = new Set(
    offices.data.filter((o) => o.uses_regions).map((o) => o.country),
  );
  return {
    departments: departments.data,
    countries: [
      ...new Set(countries.data.flatMap((r) => (r.country ? [r.country] : []))),
    ].sort(byCountryName),
    offices: offices.data.map((o) => ({
      id: o.id,
      name: o.name,
      country: o.country,
      usesRegions: o.uses_regions,
      active: o.active,
    })),
    regions: regions.data.filter((r) => regionCountries.has(r.country)),
    cities: cities.data.map((c) => ({
      id: c.id,
      officeId: c.office_id,
      regionId: c.region_id,
      name: c.name,
    })),
    nationalities: [
      ...new Set(nationalities.data.flatMap((r) => r.nationalities ?? [])),
    ].sort(byCountryName),
  };
}

/** "US · Texas · Austin", "Dubai", null when no office is set. */
export function officeText(
  office: string | null,
  location: string | null,
): string | null {
  return office ? [office, location].filter(Boolean).join(" · ") : null;
}

/** The report_all_users() arguments for these filters. */
export function allUsersArgs(filters: ReportFilters, timeZone: string) {
  const range = reportRange(filters, timeZone);
  return {
    p_from: range.from ?? undefined,
    p_to: range.to ?? undefined,
    p_type: filters.type ?? undefined,
    p_country: filters.country ?? undefined,
    p_department: filters.department ?? undefined,
    ...placeArgs(filters),
    p_search: filters.q || undefined,
  };
}

/**
 * The All users list: one page of requests plus the totals. The database
 * checks the reader (admin, approver, auditor) and RLS decides which requests
 * each person sees — approvers never get drafts or work in progress.
 */
export async function loadAllUsers(
  filters: ReportFilters,
  options: { timeZone: string; canOpenRequests: boolean; isApprover: boolean },
  supabase: ServerSupabase = createServerSupabaseClient(),
) {
  const { data, error } = await supabase.rpc("report_all_users", {
    ...allUsersArgs(filters, options.timeZone),
    p_limit: filters.limit,
  });
  if (error) throw new Error(`Could not load the report: ${error.message}`);
  const rows: AllUsersRow[] = (data ?? []).map((r) => {
    const start =
      r.type === "offboarding"
        ? `Last day ${formatDate(r.last_working_day)}`
        : `Effective ${formatDate(r.effective_date)}`;
    const end = r.closed_at
      ? `Closed ${formatDay(r.closed_at, options.timeZone)}`
      : "not closed yet";
    return {
      id: r.id,
      ticketId: r.ticket_id,
      type: r.type,
      state: r.state,
      name: personName(r.first_name, r.last_name) || "Unnamed person",
      email: r.work_email ?? "—",
      department: r.department,
      country: r.country ? countryName(r.country) : null,
      office: officeText(r.office, r.location),
      nationality: nationalityText(r.nationalities) || null,
      dates: `${start} · ${end}`,
      href:
        r.state === "closed"
          ? `/records/${r.id}`
          : options.canOpenRequests
            ? `/requests/${r.id}`
            : options.isApprover
              ? `/approvals/${r.id}`
              : null,
    };
  });
  return {
    rows,
    total: Number(data?.[0]?.total_count ?? 0),
    people: Number(data?.[0]?.people_count ?? 0),
  };
}
