import "server-only";
import { createHash } from "node:crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import { readPdfLogo, registerPdfFonts } from "@/lib/pdf/fonts";
import type { RecordInput } from "./record";
import { RecordPdf } from "./RecordPdf";

export type RenderedRecord = { bytes: Buffer; sha256: string };

/** Renders the PDF record and the SHA-256 of its bytes. */
export async function renderRecordPdf(
  input: RecordInput,
): Promise<RenderedRecord> {
  registerPdfFonts();
  const logo = await readPdfLogo();
  // Called as a function so the root element is the <Document> itself.
  const bytes = await renderToBuffer(RecordPdf({ input, logo }));
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}
