// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { definitionSchema } from "./definition";
import { runPart } from "./engine";
import { customSheets, customXlsx, sheetName } from "./xlsx";

vi.mock("server-only", () => ({}));

const TZ = "Asia/Dubai";
const def = definitionSchema.parse({
  title: "Two parts",
  parts: [
    {
      title: "Dubai joiners with Slack & Monday.com [Oct]",
      dataset: "people",
      columns: ["name", "onboarded_at", "nationalities"],
    },
    {
      title: "Per approver",
      dataset: "signatures",
      groupBy: [{ field: "approved_by" }],
      measures: [{ fn: "count" }, { fn: "avg", field: "time_to_approve" }],
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
          name: "=1+1",
          onboarded_at: "2026-10-06T08:00:00Z",
          nationalities: ["BD", "GB"],
        },
        { name: "No date", onboarded_at: null, nationalities: [] },
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
      ],
      TZ,
    ),
  },
];

describe("custom report as Excel", () => {
  test("sheet names: numbered, no [ ] : * ? / \\, at most 31 characters, unique", () => {
    const taken = new Set<string>();
    expect(
      sheetName("Dubai joiners with Slack & Monday.com [Oct]", 0, taken),
    ).toBe("1 Dubai joiners with Slack & Mo");
    expect(sheetName("a/b:c*d?", 1, taken)).toBe("2 a b c d");
    expect(sheetName("  ", 2, taken)).toBe("3 Part 3");
    const again = new Set(["1 same"]);
    expect(sheetName("same", 0, again)).toBe("1 same (2)");
  });

  test("one sheet per part: bold header row kept at the top, values as on the page, counts as numbers", () => {
    const [people, approvers] = customSheets(outcomes, TZ);
    expect(people.stickyRowsCount).toBe(1);
    expect(people.data[0]).toEqual([
      { value: "Name", fontWeight: "bold" },
      { value: "Onboarded", fontWeight: "bold" },
      { value: "Nationality", fontWeight: "bold" },
    ]);
    // Text that looks like a formula stays text.
    expect(people.data.slice(1)).toEqual([
      ["=1+1", "6 Oct 2026, 12:00", "Bangladesh, United Kingdom"],
      ["No date", null, null],
    ]);
    expect(approvers.data.slice(1)).toEqual([["Moises Larez", 2, "15h"]]);
    expect(people.columns?.map((c) => c.width)).toEqual([9, 19, 28]);
  });

  test("the file is a real .xlsx (a zip)", async () => {
    const file = await customXlsx(outcomes, TZ);
    expect(file.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(file.length).toBeGreaterThan(1000);
  });
});
