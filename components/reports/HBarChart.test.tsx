import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { HBarChart } from "./HBarChart";

describe("HBarChart", () => {
  test("one row per group: name, a bar scaled to the biggest, the number written", () => {
    const { container } = render(
      <HBarChart
        rows={[
          { key: "CH", label: "Switzerland", onboarded: 14, share: "56%" },
          { key: "DE", label: "Germany", onboarded: 7, share: "28%" },
          { key: null, label: "No country", onboarded: 4, share: "16%" },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Switzerland14",
      "Germany7",
      "No country4",
    ]);
    const widths = [...container.querySelectorAll('[aria-hidden="true"]')].map(
      (bar) => (bar as HTMLElement).style.width,
    );
    expect(widths).toEqual(["80%", "40%", "22.9%"]);
  });
});
