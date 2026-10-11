import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { ReturnInfo } from "@/lib/requests/returned";
import { ReturnedCard, SectionFlag } from "./ReturnedCard";

const INFO: ReturnInfo = {
  byName: "Moises Larez",
  byFirstName: "Moises",
  atLabel: "9 Oct 2026, 14:30",
  comment: "Figma should be Viewer, not Editor",
  flagged: [5, 9],
};

describe("ReturnedCard", () => {
  test("says who returned it, when, the comment and what happens next", () => {
    render(<ReturnedCard info={INFO} onGoTo={vi.fn()} />);
    const card = screen.getByRole("region", { name: "Returned" });
    expect(card).toHaveTextContent("Returned by Moises Larez");
    expect(card).toHaveTextContent("9 Oct 2026, 14:30");
    expect(card).toHaveTextContent("“Figma should be Viewer, not Editor”");
    expect(card).toHaveTextContent("Sections 1–9 are open again");
    expect(card).toHaveTextContent("add a note for Moises");
  });

  test("Go to opens the first flagged section", async () => {
    const onGoTo = vi.fn();
    render(<ReturnedCard info={INFO} onGoTo={onGoTo} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Go to Application access" }),
    );
    expect(onGoTo).toHaveBeenCalledWith(5);
  });

  test("no flagged sections: no Go to button", () => {
    render(<ReturnedCard info={{ ...INFO, flagged: [] }} onGoTo={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("the flag pill shows only with a label", () => {
    const { rerender } = render(<SectionFlag label="Flagged by Moises" />);
    expect(screen.getByText("Flagged by Moises")).toBeInTheDocument();
    rerender(<SectionFlag label={null} />);
    expect(screen.queryByText("Flagged by Moises")).not.toBeInTheDocument();
  });
});
