import { describe, expect, test } from "vitest";
import { formatDay } from "@/lib/requests/format";
import {
  appCount,
  cardLine,
  confirmSplit,
  dayWords,
  importCounts,
  importFooter,
  importRowState,
  leftOutLines,
  sortImportRows,
  type ImportViewRow,
} from "./view";

const row = (
  position: number,
  values: Record<string, string>,
  extra: Partial<ImportViewRow> = {},
): ImportViewRow => ({
  position,
  included: true,
  values,
  problems: [],
  skipped: null,
  ...extra,
});

const lucas = row(1, {
  firstName: "Lucas",
  lastName: "Moreau",
  jobTitle: "Backend developer",
  department: "Engineering",
  office: "Dubai",
  startDate: "2025-01-06",
  applications: "Slack (Regular Member), Google Cloud (Viewer, Editor)",
  otherApplications: "Notion (Member)",
});
const hana = row(2, {
  firstName: "Hana",
  lastName: "Kobayashi",
  startDate: "2024-06-10",
  leaveDate: "2026-02-28",
});
const nadia = row(
  3,
  { firstName: "Nadia" },
  {
    problems: [{ field: "lastName", message: "Last name missing — required" }],
  },
);
const rose = row(
  4,
  { firstName: "Rose", lastName: "Bernal" },
  { included: false, skipped: "Already in the app: UAM-2026-000014" },
);
const out = row(5, { firstName: "Sami" }, { included: false });

describe("the import check grid", () => {
  test("states: ready, needs attention, skipped, left out", () => {
    expect([lucas, nadia, rose, out].map(importRowState)).toEqual([
      "ready",
      "attention",
      "skipped",
      "left_out",
    ]);
    expect(importCounts([lucas, hana, nadia, rose, out])).toEqual({
      ready: 2,
      attention: 1,
      skipped: 1,
      left_out: 1,
    });
  });

  test("problems first, then ready, skipped, left out", () => {
    expect(
      sortImportRows([out, rose, lucas, nadia]).map((r) => r.position),
    ).toEqual([3, 1, 4, 5]);
  });

  test("a card's line and its applications (a comma in brackets stays)", () => {
    expect(cardLine(lucas.values)).toBe(
      "Backend developer · Engineering · Dubai",
    );
    expect(appCount(lucas.values)).toBe(3);
    expect(dayWords("2025-01-06")).toBe(
      formatDay("2025-01-06T12:00:00Z", "UTC"),
    );
  });

  test("footer and the Confirm's words", () => {
    const rows = [lucas, hana, nadia, rose, out];
    expect(importFooter(importCounts(rows))).toBe(
      "2 ready · 1 needs attention · 1 skipped · 1 left out",
    );
    expect(confirmSplit(rows)).toEqual({ people: 2, working: 1, leavers: 1 });
    expect(leftOutLines(rows)).toEqual([
      "Nadia — not fixed",
      "Rose Bernal — already in the app",
      "Sami — left out",
    ]);
  });
});
