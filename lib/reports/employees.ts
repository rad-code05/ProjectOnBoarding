import { formatDay } from "@/lib/requests/format";
import { countryName, personName } from "@/lib/requests/labels";
import { nationalityText } from "@/lib/requests/signing";

/** One row of report_employees_by_office(): an office · state · city. */
export type RawOfficeCount = {
  office_id: number | null;
  office: string | null;
  region_id: number | null;
  region: string | null;
  city_id: number | null;
  city: string | null;
  employees: number;
  leaving: number;
};

/** A bar / table row: an office, or (indented) one of its places. */
export type OfficeLine = {
  key: string;
  label: string;
  employees: number;
  leaving: number;
  /** "41%" of everyone. */
  share: string;
  /** A state · city under its office (the US). */
  sub: boolean;
  /** The filters that open its people: office (0 = not set), state, city. */
  link: { office: number; state?: number; city?: number };
};

export type OfficeTotals = {
  employees: number;
  leaving: number;
  /** Offices with at least one employee (not counting "Office not set"). */
  offices: number;
  biggest: { value: number; note: string } | null;
};

const shareOf = (n: number, total: number) =>
  total ? `${Math.round((n / total) * 100)}%` : "0%";

/** "Texas · Austin", "Texas", "State not set". */
function placeLabel(r: RawOfficeCount): string {
  if (!r.region) return "State not set";
  return r.city ? `${r.region} · ${r.city}` : r.region;
}

/**
 * The rows per office in the database's order (office order, not set last),
 * each office followed by its states · cities when it has any (the US) —
 * board: Phone · Employees by office.
 */
export function officeLines(rows: RawOfficeCount[]): {
  lines: OfficeLine[];
  totals: OfficeTotals;
} {
  const total = rows.reduce((s, r) => s + r.employees, 0);
  const leaving = rows.reduce((s, r) => s + r.leaving, 0);
  const offices = new Map<
    string,
    { office: RawOfficeCount; places: RawOfficeCount[] }
  >();
  for (const r of rows) {
    const key = r.office_id === null ? "none" : String(r.office_id);
    const group = offices.get(key) ?? { office: r, places: [] };
    group.places.push(r);
    offices.set(key, group);
  }

  const lines: OfficeLine[] = [];
  for (const [key, { office, places }] of offices) {
    const employees = places.reduce((s, r) => s + r.employees, 0);
    const officeId = office.office_id ?? 0;
    lines.push({
      key: `office:${key}`,
      label: office.office ?? "Office not set",
      employees,
      leaving: places.reduce((s, r) => s + r.leaving, 0),
      share: shareOf(employees, total),
      sub: false,
      link: { office: officeId },
    });
    const withPlaces = places.some((r) => r.region_id !== null);
    if (!withPlaces) continue;
    for (const r of places) {
      lines.push({
        key: `place:${key}:${r.region_id ?? "-"}:${r.city_id ?? "-"}`,
        label: placeLabel(r),
        employees: r.employees,
        leaving: r.leaving,
        share: shareOf(r.employees, total),
        sub: true,
        link: {
          office: officeId,
          ...(r.region_id ? { state: r.region_id } : {}),
          ...(r.region_id && r.city_id ? { city: r.city_id } : {}),
        },
      });
    }
  }

  const named = lines.filter((l) => !l.sub && l.link.office !== 0);
  const top = [...named].sort((a, b) => b.employees - a.employees)[0];
  return {
    lines,
    totals: {
      employees: total,
      leaving,
      offices: named.length,
      biggest: top
        ? { value: top.employees, note: `${top.label} · ${top.share}` }
        : null,
    },
  };
}

/** The people behind a row: the report's filters + that office / state / city. */
export function peopleHref(
  link: OfficeLine["link"],
  params: URLSearchParams,
): string {
  const p = new URLSearchParams(params);
  for (const key of ["office", "state", "city", "limit"]) p.delete(key);
  p.set("office", String(link.office));
  if (link.state) p.set("state", String(link.state));
  if (link.city) p.set("city", String(link.city));
  return `/reports/employees-by-office/people?${p}`;
}

/** One row of report_employees(). */
export type RawEmployee = {
  employee_id: string;
  first_name: string | null;
  last_name: string | null;
  work_email: string;
  department: string | null;
  country: string | null;
  office: string | null;
  region: string | null;
  city: string | null;
  nationalities: string[] | null;
  onboarded_at: string | null;
  latest_request_id: string | null;
  latest_ticket_id: string | null;
  leaving_request_id: string | null;
  leaving_ticket_id: string | null;
};

/** A person in the list (board: … · tap a row for the list of people). */
export type EmployeeCard = {
  id: string;
  name: string;
  /** "anna@laine.ai · Design". */
  subtitle: string;
  /** "US · Texas · Austin", "Office not set". */
  place: string;
  country: string | null;
  nationality: string | null;
  since: string | null;
  /** The record they are placed by. */
  record: { ticketId: string; href: string } | null;
  leaving: { ticketId: string; href: string | null } | null;
};

export function employeeCard(
  r: RawEmployee,
  options: { timeZone: string; canOpenRequests: boolean; isApprover: boolean },
): EmployeeCard {
  const leavingHref = r.leaving_request_id
    ? options.canOpenRequests
      ? `/requests/${r.leaving_request_id}`
      : options.isApprover
        ? `/approvals/${r.leaving_request_id}`
        : null
    : null;
  return {
    id: r.employee_id,
    name: personName(r.first_name, r.last_name) || r.work_email,
    subtitle: [r.work_email, r.department].filter(Boolean).join(" · "),
    place: employeePlace(r),
    country: r.country ? countryName(r.country) : null,
    nationality: nationalityText(r.nationalities) || null,
    since: r.onboarded_at ? formatDay(r.onboarded_at, options.timeZone) : null,
    record:
      r.latest_request_id && r.latest_ticket_id
        ? {
            ticketId: r.latest_ticket_id,
            href: `/records/${r.latest_request_id}`,
          }
        : null,
    leaving:
      r.leaving_request_id && r.leaving_ticket_id
        ? { ticketId: r.leaving_ticket_id, href: leavingHref }
        : null,
  };
}

/** "US · Texas · Austin", "Dubai", "Office not set". */
export function employeePlace(
  r: Pick<RawEmployee, "office" | "region" | "city">,
): string {
  return r.office
    ? [r.office, r.region, r.city].filter(Boolean).join(" · ")
    : "Office not set";
}

/** The heading of the people list: "US · Texas · Austin", "Everyone". */
export function peopleTitle(
  filters: {
    office: number | null;
    region: number | null;
    city: number | null;
  },
  names: {
    offices?: Record<number, string>;
    regions?: Record<number, string>;
    cities?: Record<number, string>;
  },
): string {
  if (filters.office === null) return "Everyone";
  if (filters.office === 0) return "Office not set";
  return [
    names.offices?.[filters.office] ?? "Office",
    filters.region ? names.regions?.[filters.region] : null,
    filters.city ? names.cities?.[filters.city] : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
