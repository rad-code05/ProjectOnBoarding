import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { MonthBarChart } from "./MonthBarChart";

const months = [
  { month: "2026-07-01", onboarded: 2 },
  { month: "2026-08-01", onboarded: 7 },
  { month: "2026-09-01", onboarded: 5 },
];

describe("MonthBarChart", () => {
  test("shows the busiest month first; a touched bar shows its number and the others fade", () => {
    const { container } = render(<MonthBarChart months={months} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Aug 2026 · 7 onboarded",
    );
    const bars = () =>
      [...container.querySelectorAll("path")].map((p) =>
        p.getAttribute("fill"),
      );
    expect(bars()).toEqual([
      "var(--color-ink)",
      "var(--color-ink)",
      "var(--color-ink)",
    ]);

    const july = screen.getByRole("img", { name: "Jul 2026: 2 onboarded" });
    fireEvent.pointerEnter(july);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Jul 2026 · 2 onboarded",
    );
    expect(bars()).toEqual([
      "var(--color-ink)",
      "var(--color-stone)",
      "var(--color-stone)",
    ]);

    // Keyboard: every month is reachable with Tab.
    const sept = screen.getByRole("img", { name: "Sep 2026: 5 onboarded" });
    expect(sept).toHaveAttribute("tabindex", "0");
    fireEvent.focus(sept);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sep 2026 · 5 onboarded",
    );
  });

  test("an empty period says so", () => {
    render(<MonthBarChart months={[{ month: "2026-07-01", onboarded: 0 }]} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "No onboardings in this period",
    );
  });
});
