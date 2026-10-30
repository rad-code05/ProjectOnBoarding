import { describe, expect, test } from "vitest";
import {
  batchCounts,
  CHANGE_EXAMPLE,
  CHANGE_TEMPLATE,
  fieldLabel,
  footerLine,
  rowName,
  rowState,
  sortForGrid,
  LEAVER_EXAMPLE,
  LEAVER_TEMPLATE,
  templateColumns,
} from "./view";

const row = (
  position: number,
  over: Partial<Parameters<typeof rowState>[0]> = {},
) => ({
  position,
  included: true,
  values: {},
  problems: [],
  ...over,
});

describe("the batch grid", () => {
  test("a row's name: first + last, full name, email, else its number", () => {
    expect(
      rowName(row(1, { values: { firstName: "Meera", lastName: "Nair" } })),
    ).toBe("Meera Nair");
    expect(rowName(row(1, { values: { fullName: "Abdul Rahman" } }))).toBe(
      "Abdul Rahman",
    );
    expect(rowName(row(1, { values: { workEmail: "x@laine.ai" } }))).toBe(
      "x@laine.ai",
    );
    expect(rowName(row(7))).toBe("Row 7");
  });

  test("states, counts, order: problems first, left out last", () => {
    const rows = [
      row(1),
      row(2, { problems: [{ field: "department", message: "x" }] }),
      row(3, { included: false }),
      row(4),
    ];
    expect(rows.map(rowState)).toEqual([
      "ready",
      "attention",
      "left_out",
      "ready",
    ]);
    expect(batchCounts(rows)).toEqual({ ready: 2, attention: 1, left_out: 1 });
    expect(sortForGrid(rows).map((r) => r.position)).toEqual([2, 1, 4, 3]);
    expect(footerLine(batchCounts(rows))).toBe(
      "2 ready · 1 needs attention (not created yet) · 1 left out",
    );
  });

  test("field labels from the template", () => {
    expect(fieldLabel("startDate")).toBe("Start date");
    expect(fieldLabel("unknownThing")).toBe("unknownThing");
  });
});

describe("the template's columns", () => {
  test("the person's columns, then one per application — no Applications or email-used column", () => {
    const cols = templateColumns(["Slack", "Figma"]);
    expect(cols.slice(0, 3)).toEqual(["First name", "Last name", "Work email"]);
    expect(cols.slice(-3)).toEqual(["Requested by", "Slack", "Figma"]);
    expect(cols).not.toContain("Applications");
    expect(cols.filter((c) => /email used/i.test(c))).toEqual([]);
  });
});

describe("leaver batches (F17b-5b)", () => {
  test("labels come from every kind's template", () => {
    expect(fieldLabel("person")).toBe("Name or work email");
    expect(fieldLabel("lastWorkingDay")).toBe("Last working day");
    expect(fieldLabel("startDate")).toBe("Start date");
  });

  test("the leavers template: person first, an example for every column", () => {
    expect(LEAVER_TEMPLATE[0]).toBe("Name or work email");
    expect(LEAVER_TEMPLATE).toContain("Removal method");
    expect(Object.keys(LEAVER_EXAMPLE)).toHaveLength(LEAVER_TEMPLATE.length);
  });
});

describe("access-change batches (F17b-5c)", () => {
  test("the template: person, effective date, Change / Remove / Add", () => {
    expect(CHANGE_TEMPLATE).toEqual([
      "Name or work email",
      "Effective date",
      "Change",
      "Remove",
      "Add",
    ]);
    expect(Object.keys(CHANGE_EXAMPLE)).toHaveLength(CHANGE_TEMPLATE.length);
    expect(fieldLabel("effectiveDate")).toBe("Effective date");
  });
});
