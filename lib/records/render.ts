import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Font, renderToBuffer } from "@react-pdf/renderer";
import type { RecordInput } from "./record";
import { RecordPdf } from "./RecordPdf";

/** Fonts and logo are files in the repo (OFL fonts in lib/records/fonts). */
const FONTS = path.join(process.cwd(), "lib", "records", "fonts");
const LOGO = path.join(
  process.cwd(),
  "public",
  "brand",
  "laine-logo-white.png",
);

let fontsRegistered = false;

/** Embeds Raleway, Newsreader and Instrument Serif once per server process. */
function registerFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Raleway",
    fonts: [
      { src: path.join(FONTS, "Raleway-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONTS, "Raleway-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(FONTS, "Raleway-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "Newsreader",
    src: path.join(FONTS, "Newsreader-Regular.ttf"),
  });
  Font.register({
    family: "Instrument Serif",
    src: path.join(FONTS, "InstrumentSerif-Italic.ttf"),
    fontStyle: "italic",
  });
  // Keep words whole (names, emails, ticket IDs) instead of hyphenating them.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

export type RenderedRecord = { bytes: Buffer; sha256: string };

/** Renders the PDF record and the SHA-256 of its bytes. */
export async function renderRecordPdf(
  input: RecordInput,
): Promise<RenderedRecord> {
  registerFonts();
  const logo = await readFile(LOGO);
  // Called as a function so the root element is the <Document> itself.
  const bytes = await renderToBuffer(RecordPdf({ input, logo }));
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}
