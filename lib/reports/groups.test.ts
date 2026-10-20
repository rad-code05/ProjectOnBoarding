import { describe, expect, test } from "vitest";
import { groupRows, groupTiles } from "./groups";

describe("groupRows", () => {
  test("country names, shares of the total, an empty country as its own group", () => {
    const { rows, total } = groupRows(
      [
        { key: "CH", label: "CH", onboarded: 14 },
        { key: "AE", label: "AE", onboarded: 11 },
        { key: null, label: null, onboarded: 1 },
      ],
      "country",
    );
    expect(total).toBe(26);
    expect(rows.map((r) => [r.label, r.onboarded, r.share])).toEqual([
      ["Switzerland", 14, "54%"],
      ["United Arab Emirates", 11, "42%"],
      ["No country", 1, "4%"],
    ]);
  });

  test("departments by name; no rows = total 0", () => {
    expect(
      groupRows([{ key: "2", label: "Sales", onboarded: 3 }], "department")
        .rows[0].label,
    ).toBe("Sales");
    expect(groupRows([], "department")).toEqual({ rows: [], total: 0 });
  });
});

describe("groupTiles", () => {
  test("groups with onboardings (not counting the empty one) and the biggest", () => {
    const { rows } = groupRows(
      [
        { key: "CH", label: "CH", onboarded: 14 },
        { key: null, label: null, onboarded: 2 },
      ],
      "country",
    );
    expect(groupTiles(rows, "country")).toMatchObject({
      groups: 1,
      top: { value: 14, note: "Switzerland · 88%" },
      words: { label: "Countries", column: "Country" },
    });
  });
});
