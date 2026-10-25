import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { definitionSchema } from "@/lib/reports/custom/definition";
import { runPart } from "@/lib/reports/custom/engine";
import { CustomReportParts } from "./CustomReport";
import { DeleteCustomReport } from "./DeleteCustomReport";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
const remove = vi.fn();
vi.mock("@/app/(app)/reports/actions", () => ({
  deleteCustomReport: (id: string) => remove(id),
}));

const TZ = "Asia/Dubai";
const def = definitionSchema.parse({
  title: "Two parts",
  parts: [
    {
      title: "Dubai joiners with Slack",
      dataset: "people",
      where: { op: "holds", mode: "all", items: [{ item: "Slack" }] },
      columns: ["name", "office", "onboarded_at"],
    },
    {
      title: "Time to approve",
      dataset: "signatures",
      groupBy: [{ field: "approved_by" }],
      measures: [{ fn: "avg", field: "time_to_approve" }],
      chart: true,
    },
  ],
});
const outcomes = [
  {
    part: def.parts[0],
    result: runPart(
      def.parts[0],
      [
        {
          name: "Omar Haddad",
          office: "Dubai",
          onboarded_at: "2026-10-06T08:00:00Z",
          holds: ["Slack · Regular Member"],
        },
        { name: "No Slack", office: "Dubai", onboarded_at: null, holds: [] },
      ],
      TZ,
    ),
  },
  {
    part: def.parts[1],
    result: runPart(
      def.parts[1],
      [
        { approved_by: "Moises Larez", time_to_approve: 36000 },
        { approved_by: "Moises Larez", time_to_approve: 72000 },
        { approved_by: "Celine", time_to_approve: 18000 },
      ],
      TZ,
    ),
  },
];

describe("CustomReportParts (board: Custom report page)", () => {
  test("how it is built, then each part with its count", () => {
    render(<CustomReportParts outcomes={outcomes} timeZone={TZ} />);
    expect(screen.getByText("How this report is built")).toBeInTheDocument();
    expect(
      screen.getByText(/From People today · holds Slack · columns name/),
    ).toBeInTheDocument();
    const part1 = screen.getByRole("region", {
      name: "1 · Dubai joiners with Slack",
    });
    expect(within(part1).getByText("1 row")).toBeInTheDocument();
    // Phone card and desktop table both hold the row.
    expect(within(part1).getAllByText("Omar Haddad")).toHaveLength(2);
    expect(within(part1).queryByText("No Slack")).not.toBeInTheDocument();
    expect(within(part1).getAllByText("6 Oct 2026, 12:00")).toHaveLength(2);
  });

  test("a grouped part with a chart: one bar per group, the value written", () => {
    render(<CustomReportParts outcomes={outcomes} timeZone={TZ} />);
    const part2 = screen.getByRole("region", { name: "2 · Time to approve" });
    expect(within(part2).getByText("2 groups")).toBeInTheDocument();
    const bars = within(part2).getByRole("figure");
    expect(
      within(bars)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Celine5h", "Moises Larez15h"]);
  });
});

describe("DeleteCustomReport", () => {
  test("asks first, then deletes and goes back to Reports", async () => {
    remove.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<DeleteCustomReport id="c2" />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete this report?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(remove).toHaveBeenCalledWith("c2");
    expect(push).toHaveBeenCalledWith("/reports");
  });

  test("says so when it could not delete", async () => {
    remove.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<DeleteCustomReport id="c2" />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not delete the report.",
    );
  });
});
