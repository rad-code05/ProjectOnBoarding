import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { RequestRow } from "@/lib/requests/list";
import { RequestList } from "./RequestList";

const row = (overrides: Partial<RequestRow>): RequestRow => ({
  id: "11111111-1111-1111-1111-111111111111",
  ticket_id: "UAM-2026-000001",
  type: "onboarding",
  state: "draft",
  first_name: "Anna",
  last_name: "Keller",
  work_email: "anna.keller@example.test",
  country: "CH",
  effective_date: "2026-10-14",
  updated_at: "2026-10-07T11:55:00Z",
  assignee: { first_name: "Raju", last_name: "Bholani" },
  ...overrides,
});

const now = new Date("2026-10-07T12:00:00Z");

describe("RequestList", () => {
  test("shows each request as a card (phone) and a table row (desktop)", () => {
    render(<RequestList rows={[row({})]} now={now} />);
    const card = document.querySelector("ul a")!;
    expect(card).toHaveAttribute(
      "href",
      "/requests/11111111-1111-1111-1111-111111111111",
    );
    expect(card).toHaveTextContent("Anna Keller");
    expect(card).toHaveTextContent("Draft");
    expect(card).toHaveTextContent("Switzerland");
    expect(card).toHaveTextContent("Effective 14 Oct 2026");

    // Plain DOM lookups: role queries over a whole table are slow in jsdom.
    const cells = Array.from(document.querySelectorAll("td")).map(
      (c) => c.textContent,
    );
    expect(cells).toEqual(
      expect.arrayContaining([
        "UAM-2026-000001",
        "Onboarding",
        "Draft",
        "Switzerland",
        "Raju Bholani",
        "5 minutes ago",
      ]),
    );
  });

  test("a fresh draft without a name still has a readable label", () => {
    render(
      <RequestList
        rows={[row({ first_name: null, last_name: null, work_email: null })]}
        now={now}
      />,
    );
    expect(screen.getAllByText("New request").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No work email yet").length).toBeGreaterThan(0);
  });

  test("closed requests show the PDF marker", () => {
    render(<RequestList rows={[row({ state: "closed" })]} now={now} />);
    expect(screen.getAllByText("PDF").length).toBe(2);
  });
});
