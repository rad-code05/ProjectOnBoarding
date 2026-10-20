import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SignatureLogList } from "./SignatureLogList";

describe("SignatureLogList", () => {
  test("a card per request: who, status, the four sign-off lines, a link", () => {
    render(
      <SignatureLogList
        rows={[
          {
            id: "r1",
            ticketId: "UAM-2026-000141",
            type: "access_modification",
            state: "closed",
            name: "Anna Keller",
            itSigned: "15 Oct 2026, 11:02 · Raju Bholani",
            approved: "15 Oct 2026, 16:05 · Moises Larez",
            timeToApprove: "5h 3m · returned once",
            pdf: "Made 15 Oct 2026, 16:05",
            href: "/records/r1",
          },
        ]}
      />,
    );
    const card = screen.getByRole("listitem");
    expect(
      within(card).getByRole("link", { name: /Anna Keller/ }),
    ).toHaveAttribute("href", "/records/r1");
    expect(card).toHaveTextContent("UAM-2026-000141 · Access modification");
    expect(card).toHaveTextContent("Closed");
    expect(card).toHaveTextContent(
      "IT signed15 Oct 2026, 11:02 · Raju Bholani",
    );
    expect(card).toHaveTextContent("Approved15 Oct 2026, 16:05 · Moises Larez");
    expect(card).toHaveTextContent("Time to approve5h 3m · returned once");
    expect(card).toHaveTextContent("PDF recordMade 15 Oct 2026, 16:05");
  });
});
