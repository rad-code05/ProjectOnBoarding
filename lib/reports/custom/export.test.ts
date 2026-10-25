// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { renderReportPdf } from "@/lib/reports/pdf";
import { definitionSchema } from "./definition";
import { runPart } from "./engine";
import { customCsv, customFileName, customPdfSections } from "./export";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => {
    throw new Error("not used in this test");
  },
}));

const TZ = "Asia/Dubai";
const def = definitionSchema.parse({
  title: "Two parts",
  parts: [
    {
      title: "Dubai joiners",
      dataset: "people",
      columns: ["name", "office", "onboarded_at"],
    },
    {
      title: "Time to approve",
      dataset: "signatures",
      groupBy: [{ field: "approved_by" }],
      measures: [{ fn: "avg", field: "time_to_approve" }],
      chart: true,
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
          name: "Omar Haddad",
          office: "Dubai",
          onboarded_at: "2026-10-06T08:00:00Z",
        },
        { name: "=HYPERLINK(1)", office: null, onboarded_at: null },
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
        { approved_by: "Celine", time_to_approve: 18000 },
      ],
      TZ,
    ),
  },
];

describe("custom report files", () => {
  test("file names from the title, accents and symbols removed", () => {
    expect(customFileName("Dubai joiners with Slack & Monday.com", "csv")).toBe(
      "custom-report_dubai-joiners-with-slack-monday-com.csv",
    );
    expect(customFileName("Ëmployés · Genève", "pdf")).toBe(
      "custom-report_employes-geneve.pdf",
    );
    expect(customFileName("§§§", "xlsx")).toBe("custom-report_report.xlsx");
  });

  test("CSV: one file, a Part column, every column once, empty where a part has none", () => {
    const { header, body } = customCsv(outcomes, TZ);
    expect(header).toEqual([
      "Part",
      "Name",
      "Office",
      "Onboarded",
      "Approved by",
      "Average time to approve",
    ]);
    expect(body).toEqual([
      [
        "1 · Dubai joiners",
        "Omar Haddad",
        "Dubai",
        "6 Oct 2026, 12:00",
        null,
        null,
      ],
      ["1 · Dubai joiners", "=HYPERLINK(1)", null, null, null, null],
      ["2 · Time to approve", null, null, null, "Celine", "5h"],
      ["2 · Time to approve", null, null, null, "Moises Larez", "10h"],
    ]);
  });

  test("PDF: a section per part, how it is built, a chart for the grouped part", async () => {
    const sections = customPdfSections(outcomes, TZ);
    expect(sections.map((s) => s.title)).toEqual([
      "1 · Dubai joiners",
      "2 · Time to approve",
    ]);
    expect(sections[0].note).toBe(
      "From People today · everyone in it · columns name, office and onboarded · 2 rows",
    );
    expect(sections[0].chart).toBeUndefined();
    expect(sections[1].chart?.bars).toEqual([
      { label: "Celine", value: 18000, text: "5h" },
      { label: "Moises Larez", value: 36000, text: "10h" },
    ]);
    expect(sections[1].table.columns.map((c) => c.align)).toEqual([
      "left",
      "right",
    ]);

    const bytes = await renderReportPdf({
      title: "Two parts",
      group: "Custom report · made with the assistant",
      definition: "Built from the report data you're allowed to see.",
      period: "Data as of the export (company time, Dubai)",
      filters: [],
      generatedBy: "Ada Admin",
      generatedAt: "25 Oct 2026, 10:42 (Dubai)",
      sections,
      table: { columns: [], rows: [] },
      empty: "",
    });
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
