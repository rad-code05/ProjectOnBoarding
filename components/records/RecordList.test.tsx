import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { RecordList } from "./RecordList";

const ID = "22222222-2222-2222-2222-222222222222";

describe("RecordList", () => {
  test("each record opens its page and offers its PDF", () => {
    render(
      <RecordList
        rows={[
          {
            id: ID,
            ticketId: "UAM-2026-000124",
            type: "onboarding",
            name: "Anna Keller",
            closed: "9 Oct 2026",
            approvedBy: "Moises Larez",
            imported: false,
          },
        ]}
      />,
    );
    const open = screen.getByRole("link", { name: /^Anna Keller/ });
    expect(open).toHaveAttribute("href", `/records/${ID}`);
    expect(open).toHaveTextContent("UAM-2026-000124 · Onboarding");
    expect(open).toHaveTextContent(
      "Closed 9 Oct 2026 · approved by Moises Larez",
    );
    expect(
      screen.getByRole("link", {
        name: "Download the PDF record of Anna Keller",
      }),
    ).toHaveAttribute("href", `/records/${ID}/pdf`);
  });

  test("an Imported record: its own date, a badge, no app PDF", () => {
    render(
      <RecordList
        rows={[
          {
            id: ID,
            ticketId: "IMP-2025-000004",
            type: "onboarding",
            name: "Lucas Moreau",
            closed: "6 Jan 2025",
            approvedBy: "—",
            imported: true,
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("link", { name: /^Lucas Moreau/ }),
    ).toHaveTextContent("Started 6 Jan 2025 · imported");
    expect(screen.getByText("Imported")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Download the PDF/ })).toBeNull();
  });
});
