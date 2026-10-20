import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { slaSummary } from "@/lib/reports/sla";
import { SlaReportList, SlaTimelineTable } from "./SlaReportList";

describe("SlaReportList", () => {
  test("a card per offboarding: who, the result in words, the four lines, a link", () => {
    render(
      <SlaReportList
        rows={[
          {
            id: "r1",
            ticketId: "UAM-2026-000131",
            state: "closed",
            name: "Mia Rossi",
            subtitle: "UAM-2026-000131 · Within 24h · Closed",
            result: "Missed",
            tone: "missed",
            cutoff: "29 Sep 2026, 17:00",
            deadline: "30 Sep 2026, 17:00",
            removals: "All 6 · 1 Oct 2026, 09:40",
            noteLabel: "Reason",
            note: "Owner rights needed the org admin.",
            href: "/records/r1",
          },
        ]}
      />,
    );
    const card = screen.getByRole("listitem");
    expect(
      within(card).getByRole("link", { name: /Mia Rossi/ }),
    ).toHaveAttribute("href", "/records/r1");
    expect(card).toHaveTextContent("UAM-2026-000131 · Within 24h · Closed");
    expect(within(card).getByText("Missed")).toHaveClass("bg-signal");
    for (const text of [
      "Access cut-off",
      "30 Sep 2026, 17:00",
      "All 6 · 1 Oct 2026, 09:40",
      "Reason",
      "Owner rights needed the org admin.",
    ]) {
      expect(card).toHaveTextContent(text);
    }
  });
});

describe("SlaTimelineTable", () => {
  test("one row per timeline and the totals", () => {
    render(
      <SlaTimelineTable
        summary={slaSummary([
          {
            sla_timeline: "same_day",
            met: 4,
            missed: 0,
            open: 1,
            overdue: 0,
            no_removals: 0,
          },
          {
            sla_timeline: "within_24h",
            met: 3,
            missed: 1,
            open: 0,
            overdue: 1,
            no_removals: 0,
          },
        ])}
      />,
    );
    const table = screen.getByRole("table", { name: "By timeline" });
    const rows = within(table).getAllByRole("row");
    expect(rows.map((r) => r.textContent)).toEqual([
      "TimelineMetMissedOpen",
      "Same day401",
      "Within 24h311",
      "Within 48h000",
      "Total712",
    ]);
  });
});
