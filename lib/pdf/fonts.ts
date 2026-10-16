import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

/** Fonts and logo are files in the repo (OFL fonts in lib/records/fonts). */
const FONTS = path.join(process.cwd(), "lib", "records", "fonts");
const LOGO = path.join(
  process.cwd(),
  "public",
  "brand",
  "laine-logo-white.png",
);

let fontsRegistered = false;

/**
 * Embeds Raleway, Newsreader and Instrument Serif once per server process
 * (PDF record and report PDFs). On Vercel the files are listed in
 * next.config.ts → outputFileTracingIncludes for every route that renders.
 */
export function registerPdfFonts() {
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

/** The white Laine logo (only ever on the black band). */
export function readPdfLogo(): Promise<Buffer> {
  return readFile(LOGO);
}
