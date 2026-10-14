// @vitest-environment node
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, test, vi } from "vitest";
import {
  sampleAccessChangeRecord,
  sampleOffboardingRecord,
  sampleRecord,
} from "./fixture";
import { renderRecordPdf } from "./render";

vi.mock("server-only", () => ({}));

/** pdfkit writes one "/Type /Page" object per page. */
const pageCount = (bytes: Buffer) =>
  bytes.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0;

describe("renderRecordPdf", () => {
  test("renders an A4 PDF of at least two pages, with its SHA-256", async () => {
    const { bytes, sha256 } = await renderRecordPdf(sampleRecord());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(bytes)).toBeGreaterThanOrEqual(2);
    const a4 = /\/MediaBox \[0 0 595\.\d+ 841\.\d+\]/;
    expect(a4.test(bytes.toString("latin1")), "A4 pages").toBe(true);
    expect(sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    // A copy to look at by hand: RECORD_PREVIEW=<path> pnpm exec vitest run lib/records
    if (process.env.RECORD_PREVIEW) {
      await writeFile(process.env.RECORD_PREVIEW, bytes);
    }
  }, 60_000);

  test("an offboarding record renders too (F09d-3)", async () => {
    const { bytes } = await renderRecordPdf(sampleOffboardingRecord());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(bytes)).toBeGreaterThanOrEqual(2);
    // OFFBOARDING_PREVIEW=<path> pnpm exec vitest run lib/records
    if (process.env.OFFBOARDING_PREVIEW) {
      await writeFile(process.env.OFFBOARDING_PREVIEW, bytes);
    }
  }, 60_000);

  test("an access change record renders too (F10d)", async () => {
    const { bytes } = await renderRecordPdf(sampleAccessChangeRecord());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(bytes)).toBeGreaterThanOrEqual(2);
    // ACCESS_CHANGE_PREVIEW=<path> pnpm exec vitest run lib/records
    if (process.env.ACCESS_CHANGE_PREVIEW) {
      await writeFile(process.env.ACCESS_CHANGE_PREVIEW, bytes);
    }
  }, 60_000);

  test("embeds an applied PNG signature", async () => {
    const png = await sharp({
      create: { width: 600, height: 200, channels: 4, background: "#000000" },
    })
      .png()
      .toBuffer();
    const input = sampleRecord();
    input.signatures = input.signatures.map((s) =>
      s.section === "it_execution" ? { ...s, typedText: null, image: png } : s,
    );
    const { bytes } = await renderRecordPdf(input);
    expect(bytes.toString("latin1")).toContain("/Subtype /Image");
  }, 60_000);
});
