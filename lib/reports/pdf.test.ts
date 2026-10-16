// @vitest-environment node
import { writeFile } from "node:fs/promises";
import { describe, expect, test, vi } from "vitest";
import type { ReportPdfInput } from "./ReportPdf";
import { renderReportPdf } from "./pdf";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => {
    throw new Error("not used in this test");
  },
}));

/** pdfkit writes one "/Type /Page" object per page. */
const pageCount = (bytes: Buffer) =>
  bytes.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0;

const base: Omit<ReportPdfInput, "table" | "empty"> = {
  title: "All users list",
  group: "People",
  definition:
    "Everyone with an onboarding, offboarding or access-change request created in the period, newest first. Cancelled requests are left out.",
  period: "16 Oct 2025 – 15 Oct 2026 (company time, Dubai)",
  filters: ["Type: Onboarding", "Country: Switzerland"],
  generatedBy: "Ada Admin",
  generatedAt: "16 Oct 2026, 09:12 (Dubai)",
};

describe("renderReportPdf", () => {
  test("a long All users list flows onto several landscape A4 pages", async () => {
    const bytes = await renderReportPdf({
      ...base,
      landscape: true,
      table: {
        columns: [
          { label: "Ticket", width: 1.3 },
          { label: "Name", width: 1.5 },
          { label: "Work email", width: 2.2 },
          { label: "Status", width: 1.3 },
        ],
        rows: Array.from({ length: 60 }, (_, i) => [
          `UAM-2026-${String(i + 1).padStart(6, "0")}`,
          `Person ${i + 1}`,
          `person.${i + 1}@example.com`,
          "Closed",
        ]),
      },
      empty: "No requests match these filters.",
    });
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(bytes)).toBeGreaterThanOrEqual(2);
    const landscape = /\/MediaBox \[0 0 841\.\d+ 595\.\d+\]/;
    expect(landscape.test(bytes.toString("latin1")), "landscape A4").toBe(true);
    // REPORT_PREVIEW=<path> pnpm exec vitest run lib/reports/pdf
    if (process.env.REPORT_PREVIEW) {
      await writeFile(process.env.REPORT_PREVIEW, bytes);
    }
  }, 60_000);

  test("Onboarded by month: tiles, chart and table on a portrait page", async () => {
    const months = ["N", "D", "J", "F", "M", "A", "M", "J", "J", "A", "S", "O"];
    const values = [3, 2, 4, 3, 5, 4, 3, 4, 2, 7, 5, 4];
    const bytes = await renderReportPdf({
      ...base,
      title: "Onboarded by month",
      filters: [],
      tiles: [
        { label: "This month", value: "4", note: "Oct 2026, so far" },
        { label: "In this period", value: "46", note: "Nov 2025 – Oct 2026" },
        { label: "Busiest month", value: "7", note: "Aug 2026" },
      ],
      chart: {
        title: "Onboarded per month",
        bars: months.map((label, i) => ({ label, value: values[i] })),
      },
      table: {
        columns: [
          { label: "Month", width: 3 },
          { label: "Onboarded", width: 1, align: "right" },
        ],
        rows: values.map((v, i) => [`Month ${i + 1}`, String(v)]),
        total: ["Total", "46"],
      },
      empty: "No months in this period.",
    });
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const portrait = /\/MediaBox \[0 0 595\.\d+ 841\.\d+\]/;
    expect(portrait.test(bytes.toString("latin1")), "portrait A4").toBe(true);
    // MONTH_PREVIEW=<path> pnpm exec vitest run lib/reports/pdf
    if (process.env.MONTH_PREVIEW) {
      await writeFile(process.env.MONTH_PREVIEW, bytes);
    }
  }, 60_000);

  test("an empty report says so instead of an empty table", async () => {
    const bytes = await renderReportPdf({
      ...base,
      table: { columns: [{ label: "Ticket", width: 1 }], rows: [] },
      empty: "No requests match these filters.",
    });
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(bytes)).toBe(1);
  }, 60_000);
});
