import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AllUsersList } from "./AllUsersList";

describe("AllUsersList", () => {
  test("a card per request: who, status, ticket line, office + nationality, dates, link", () => {
    render(
      <AllUsersList
        rows={[
          {
            id: "r1",
            ticketId: "UAM-2026-000141",
            type: "access_modification",
            state: "closed",
            name: "Anna Keller",
            email: "anna.keller@example.com",
            department: "Design",
            country: "Switzerland",
            office: "US · Texas · Austin",
            nationality: "Switzerland, Italy",
            dates: "Effective 20 Oct 2026 · Closed 15 Oct 2026",
            href: "/records/r1",
          },
          {
            id: "r2",
            ticketId: "UAM-2026-000139",
            type: "onboarding",
            state: "in_execution",
            name: "Lea Brun",
            email: "lea.brun@example.com",
            department: null,
            country: null,
            office: null,
            nationality: null,
            dates: "Effective 3 Nov 2026 · not closed yet",
            href: null,
          },
        ]}
      />,
    );
    const [anna, lea] = screen.getAllByRole("listitem");
    expect(
      within(anna).getByRole("link", { name: /Anna Keller/ }),
    ).toHaveAttribute("href", "/records/r1");
    expect(anna).toHaveTextContent("Closed");
    expect(anna).toHaveTextContent(
      "UAM-2026-000141 · Access modification · Design · Switzerland",
    );
    expect(anna).toHaveTextContent(
      "Effective 20 Oct 2026 · Closed 15 Oct 2026",
    );
    expect(within(lea).queryByRole("link")).not.toBeInTheDocument();
    expect(lea).toHaveTextContent("In execution");
    expect(anna).toHaveTextContent(
      "Office: US · Texas · Austin · Nationality: Switzerland, Italy",
    );
    expect(lea).toHaveTextContent("UAM-2026-000139 · Onboarding");
    expect(lea).not.toHaveTextContent("Office");
  });
});
