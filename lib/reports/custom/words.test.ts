import { describe, expect, test } from "vitest";
import { definitionSchema } from "./definition";
import { formatCell, partWords, whereWords } from "./words";

const TZ = "Asia/Dubai";
const col = (type: Parameters<typeof formatCell>[1]["type"]) => ({
  key: "x",
  label: "X",
  type,
});

describe("formatCell", () => {
  test("values as people read them", () => {
    expect(formatCell(null, col("text"), TZ)).toBe("—");
    expect(formatCell([], col("list"), TZ)).toBe("—");
    expect(formatCell(["BD", "GB"], col("list"), TZ)).toBe("BD, GB");
    expect(formatCell(true, col("boolean"), TZ)).toBe("Yes");
    expect(formatCell(54000, col("duration"), TZ)).toBe("15h");
    expect(formatCell(1234, col("number"), TZ)).toBe("1,234");
    expect(formatCell("2026-10", col("text"), TZ)).toBe("Oct 2026");
    expect(formatCell("2026-09-30", col("date"), TZ)).toBe("30 Sept 2026");
    // A moment in company time: 21:00 UTC on 11 Oct is 12 Oct in Dubai.
    expect(formatCell("2026-10-11T21:00:00Z", col("datetime"), TZ)).toBe(
      "12 Oct 2026, 01:00",
    );
  });
});

describe("countries: codes in the data, full names for people", () => {
  const country = { ...col("text"), country: true };
  const nationality = { ...col("list"), country: true };
  test("cells", () => {
    expect(formatCell("AE", country, TZ)).toBe("United Arab Emirates");
    expect(formatCell("ch", country, TZ)).toBe("Switzerland");
    expect(formatCell(["BD", "GB"], nationality, TZ)).toBe(
      "Bangladesh, United Kingdom",
    );
    // A group of "either nationality" rows keeps both names.
    expect(formatCell("BD, GB", nationality, TZ)).toBe(
      "Bangladesh, United Kingdom",
    );
    expect(formatCell([], nationality, TZ)).toBe("—");
  });
  test("conditions in How this report is built", () => {
    const [part] = definitionSchema.parse({
      title: "t",
      parts: [{ title: "p", dataset: "people", columns: ["name"] }],
    }).parts;
    expect(
      whereWords({ op: "in", field: "country", values: ["AE", "CH"] }, part),
    ).toBe('work country is "United Arab Emirates" or "Switzerland"');
    expect(
      whereWords({ op: "eq", field: "nationalities", value: "bd" }, part),
    ).toBe('nationality is "Bangladesh"');
  });
});

describe("partWords: How this report is built", () => {
  const parts = definitionSchema.parse({
    title: "t",
    parts: [
      {
        title: "Dubai joiners",
        dataset: "people",
        where: {
          all: [
            {
              op: "between",
              field: "onboarded_at",
              from: "2026-10-05",
              to: "2026-10-11",
            },
            { op: "eq", field: "office", value: "Dubai" },
            {
              op: "holds",
              mode: "all",
              items: [{ item: "Slack" }, { item: "Monday.com" }],
            },
            {
              any: [
                { op: "day_of_month", field: "onboarded_at", days: "even" },
                {
                  not: {
                    op: "holds",
                    mode: "any",
                    items: [{ item: "GitHub" }],
                  },
                },
              ],
            },
          ],
        },
        columns: ["name", "email"],
        sort: [{ by: "name", dir: "asc" }],
      },
      {
        title: "Time to approve",
        dataset: "signatures",
        groupBy: [
          { field: "approved_by" },
          { field: "approved_at", by: "month" },
        ],
        measures: [{ fn: "avg", field: "time_to_approve" }],
      },
    ],
  }).parts;

  test("conditions, columns and order in one line", () => {
    expect(partWords(parts[0])).toBe(
      'From People today · onboarded 5 Oct 2026 – 11 Oct 2026 · office is "Dubai" · holds Slack and Monday.com · (onboarded on an even day of the month or not (holds GitHub)) · columns name and work email · sorted by name (A to Z / lowest first)',
    );
  });

  test("grouping and the measure", () => {
    expect(partWords(parts[1])).toBe(
      "From Signatures · everyone in it · grouped by approved by and approved (month) · shows the average time to approve",
    );
  });
});
