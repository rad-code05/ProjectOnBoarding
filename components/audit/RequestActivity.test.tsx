import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import type { ActivityEntry } from "@/lib/audit/timeline";
import { RequestActivity } from "./RequestActivity";

const step = (
  id: number,
  patch: Partial<ActivityEntry> = {},
): ActivityEntry => ({
  id,
  at: "2026-10-15T07:00:00Z",
  who: "Raju Bholani",
  what: `added app ${id}`,
  context: null,
  note: null,
  dot: "step",
  ...patch,
});

describe("RequestActivity", () => {
  test("newest 8 first, a return with its comment, the rest behind a button", async () => {
    const user = userEvent.setup();
    render(
      <RequestActivity
        timeZone="Asia/Dubai"
        entries={[
          step(12, {
            who: "Moises Larez",
            what: "returned it to IT",
            context: "flagged section 5",
            note: "“Why Figma Admin?”",
            dot: "return",
          }),
          ...[11, 10, 9, 8, 7, 6, 5, 4, 3].map((id) => step(id)),
        ]}
      />,
    );
    expect(screen.getByRole("region", { name: "Activity" })).toHaveTextContent(
      "10 events · newest first",
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(8);
    expect(items[0]).toHaveTextContent(
      "Moises Larez returned it to IT15 Oct 2026, 11:00 · flagged section 5“Why Figma Admin?”",
    );
    expect(
      screen.getByText(/Admins and auditors can open the full audit log\./),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Show 2 earlier events" }),
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });

  test("admins and auditors get a link to the full audit log", () => {
    render(
      <RequestActivity
        timeZone="Asia/Dubai"
        entries={[step(1)]}
        showAuditLink
      />,
    );
    expect(
      screen.getByRole("link", { name: "Open the full audit log" }),
    ).toHaveAttribute("href", "/audit");
    expect(screen.getByText("1 event · newest first")).toBeInTheDocument();
  });
});
