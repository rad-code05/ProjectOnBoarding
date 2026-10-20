import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { OpenGroup } from "@/lib/reports/open";
import { OpenRequestGroups, OpenStatusBars } from "./OpenRequests";

const groups: OpenGroup[] = [
  {
    state: "pending_confirmation",
    title: "Awaiting confirmation",
    with: "the approver",
    rows: [],
  },
  {
    state: "in_execution",
    title: "In execution",
    with: "IT (Raju)",
    rows: [
      {
        id: "r2",
        state: "in_execution",
        name: "Jonas Meier",
        subtitle: "UAM-2026-000149 · Offboarding",
        waiting: "1d 5h",
        waitingSeconds: 104_400,
        opened: "18 Oct 2026",
        sla: "Overdue 3h",
        href: "/requests/r2",
      },
    ],
  },
];

describe("OpenStatusBars", () => {
  test("every status with who it waits for and the number", () => {
    render(<OpenStatusBars groups={groups} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(
      "Awaiting confirmationwith the approver0",
    );
    expect(items[1]).toHaveTextContent("In executionwith IT (Raju)1");
  });
});

describe("OpenRequestGroups", () => {
  test("only statuses with requests; each card waits, opens and shows the SLA", () => {
    render(<OpenRequestGroups groups={groups} />);
    expect(
      screen.queryByRole("region", { name: "Awaiting confirmation" }),
    ).not.toBeInTheDocument();
    const section = screen.getByRole("region", { name: "In execution" });
    expect(
      within(section).getByRole("heading", { name: "In execution · 1" }),
    ).toBeInTheDocument();
    const card = within(section).getByRole("link", { name: /Jonas Meier/ });
    expect(card).toHaveAttribute("href", "/requests/r2");
    expect(card).toHaveTextContent("Waiting 1d 5h · opened 18 Oct 2026");
    expect(card).toHaveTextContent("Overdue 3h");
  });
});
