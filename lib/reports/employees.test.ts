import { describe, expect, test } from "vitest";
import {
  employeeCard,
  employeePlace,
  officeLines,
  peopleHref,
  peopleTitle,
  type RawEmployee,
  type RawOfficeCount,
} from "./employees";

const row = (r: Partial<RawOfficeCount>): RawOfficeCount => ({
  office_id: null,
  office: null,
  region_id: null,
  region: null,
  city_id: null,
  city: null,
  employees: 0,
  leaving: 0,
  ...r,
});

// The board's example: Dubai 18, Geneva 11, US 9 (by state · city), Abu Dhabi 6.
const rows = [
  row({ office_id: 1, office: "Dubai", employees: 18, leaving: 1 }),
  row({ office_id: 3, office: "Geneva", employees: 11 }),
  row({
    office_id: 4,
    office: "US",
    region_id: 33,
    region: "New York",
    city_id: 7,
    city: "New York City",
    employees: 5,
    leaving: 1,
  }),
  row({
    office_id: 4,
    office: "US",
    region_id: 44,
    region: "Texas",
    city_id: 9,
    city: "Austin",
    employees: 3,
  }),
  row({
    office_id: 4,
    office: "US",
    region_id: 44,
    region: "Texas",
    employees: 1,
  }),
  row({ office_id: 2, office: "Abu Dhabi", employees: 6 }),
  row({ employees: 2 }),
];

describe("officeLines", () => {
  test("offices in the database's order, the US followed by its states · cities", () => {
    const { lines } = officeLines(rows);
    expect(
      lines.map((l) => [l.label, l.employees, l.leaving, l.share, l.sub]),
    ).toEqual([
      ["Dubai", 18, 1, "39%", false],
      ["Geneva", 11, 0, "24%", false],
      ["US", 9, 1, "20%", false],
      ["New York · New York City", 5, 1, "11%", true],
      ["Texas · Austin", 3, 0, "7%", true],
      ["Texas", 1, 0, "2%", true],
      ["Abu Dhabi", 6, 0, "13%", false],
      ["Office not set", 2, 0, "4%", false],
    ]);
    expect(lines[4].link).toEqual({ office: 4, state: 44, city: 9 });
    expect(lines[5].link).toEqual({ office: 4, state: 44 });
    expect(lines[7].link).toEqual({ office: 0 });
  });

  test("totals: everyone, leaving, offices (not counting not set), the biggest", () => {
    expect(officeLines(rows).totals).toEqual({
      employees: 46,
      leaving: 2,
      offices: 4,
      biggest: { value: 18, note: "Dubai · 39%" },
    });
    expect(officeLines([]).totals).toEqual({
      employees: 0,
      leaving: 0,
      offices: 0,
      biggest: null,
    });
  });

  test("a US office without a state shows it", () => {
    const { lines } = officeLines([
      row({ office_id: 4, office: "US", employees: 1 }),
      row({
        office_id: 4,
        office: "US",
        region_id: 44,
        region: "Texas",
        employees: 1,
      }),
    ]);
    expect(lines.map((l) => l.label)).toEqual(["US", "State not set", "Texas"]);
  });
});

describe("peopleHref / peopleTitle", () => {
  test("keeps the report's filters, replaces the place", () => {
    expect(
      peopleHref(
        { office: 4, state: 44, city: 9 },
        new URLSearchParams("department=2&office=1&limit=40"),
      ),
    ).toBe(
      "/reports/employees-by-office/people?department=2&office=4&state=44&city=9",
    );
    expect(peopleHref({ office: 0 }, new URLSearchParams())).toBe(
      "/reports/employees-by-office/people?office=0",
    );
  });

  test("the heading names the place", () => {
    const names = {
      offices: { 4: "US" },
      regions: { 44: "Texas" },
      cities: { 9: "Austin" },
    };
    expect(peopleTitle({ office: 4, region: 44, city: 9 }, names)).toBe(
      "US · Texas · Austin",
    );
    expect(peopleTitle({ office: 0, region: null, city: null }, names)).toBe(
      "Office not set",
    );
    expect(peopleTitle({ office: null, region: null, city: null }, names)).toBe(
      "Everyone",
    );
  });
});

describe("employeeCard", () => {
  const raw: RawEmployee = {
    employee_id: "e1",
    first_name: "Ben",
    last_name: "Ortiz",
    work_email: "ben@example.com",
    department: "Sales",
    country: "US",
    office: "US",
    region: "Texas",
    city: "Austin",
    nationalities: ["US", "MX"],
    onboarded_at: "2026-09-01T08:00:00Z",
    latest_request_id: "r1",
    latest_ticket_id: "UAM-2026-000101",
    leaving_request_id: "r2",
    leaving_ticket_id: "UAM-2026-000140",
  };
  const options = {
    timeZone: "Asia/Dubai",
    canOpenRequests: true,
    isApprover: false,
  };

  test("name, place, nationality, onboarded, latest record, Leaving", () => {
    expect(employeeCard(raw, options)).toEqual({
      id: "e1",
      name: "Ben Ortiz",
      subtitle: "ben@example.com · Sales",
      place: "US · Texas · Austin",
      country: "United States",
      nationality: "United States, Mexico",
      since: "1 Sept 2026",
      record: { ticketId: "UAM-2026-000101", href: "/records/r1" },
      leaving: { ticketId: "UAM-2026-000140", href: "/requests/r2" },
    });
  });

  test("approvers open the offboarding as an approval; auditors get no link", () => {
    expect(
      employeeCard(raw, {
        ...options,
        canOpenRequests: false,
        isApprover: true,
      }).leaving?.href,
    ).toBe("/approvals/r2");
    expect(
      employeeCard(raw, { ...options, canOpenRequests: false }).leaving?.href,
    ).toBeNull();
  });

  test('no office = "Office not set"', () => {
    expect(employeePlace({ office: null, region: null, city: null })).toBe(
      "Office not set",
    );
  });
});
