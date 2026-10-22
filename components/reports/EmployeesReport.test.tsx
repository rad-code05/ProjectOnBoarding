import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { officeLines } from "@/lib/reports/employees";
import { EmployeeList, OfficeBars, OfficeTable } from "./EmployeesReport";

const { lines, totals } = officeLines([
  {
    office_id: 1,
    office: "Dubai",
    region_id: null,
    region: null,
    city_id: null,
    city: null,
    employees: 3,
    leaving: 1,
  },
  {
    office_id: 4,
    office: "US",
    region_id: 44,
    region: "Texas",
    city_id: 9,
    city: "Austin",
    employees: 1,
    leaving: 0,
  },
]);

describe("Employees by office", () => {
  test("each bar opens its people", () => {
    render(<OfficeBars lines={lines} hrefFor={(l) => `/people/${l.key}`} />);
    expect(screen.getByRole("link", { name: /Dubai\s*3/ })).toHaveAttribute(
      "href",
      "/people/office:1",
    );
    expect(
      screen.getByRole("link", { name: /Texas · Austin\s*1/ }),
    ).toHaveAttribute("href", "/people/place:4:44:9");
  });

  test("the table: employees, leaving, share, total", () => {
    render(<OfficeTable lines={lines} totals={totals} />);
    const table = screen.getByRole("table", { name: "Every office" });
    expect(
      within(table).getByRole("row", { name: /Dubai 3 1 75%/ }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("row", { name: /Texas · Austin 1 0 25%/ }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("row", { name: "Total 4 1 100%" }),
    ).toBeInTheDocument();
  });

  test("a person: office, nationality, latest record, Leaving", () => {
    render(
      <EmployeeList
        rows={[
          {
            id: "e1",
            name: "Ben Ortiz",
            subtitle: "ben@example.com · Sales",
            place: "US · Texas · Austin",
            country: "United States",
            nationality: "United States, Mexico",
            since: "1 Sept 2026",
            record: { ticketId: "UAM-2026-000101", href: "/records/r1" },
            leaving: { ticketId: "UAM-2026-000140", href: null },
          },
        ]}
      />,
    );
    const card = screen.getByRole("listitem");
    expect(card).toHaveTextContent("OfficeUS · Texas · Austin");
    expect(card).toHaveTextContent("NationalityUnited States, Mexico");
    expect(
      within(card).getByRole("link", { name: "UAM-2026-000101" }),
    ).toHaveAttribute("href", "/records/r1");
    expect(card).toHaveTextContent(
      "Leaving — offboarding UAM-2026-000140 is open",
    );
  });
});
