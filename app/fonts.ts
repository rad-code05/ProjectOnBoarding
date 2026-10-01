import { Instrument_Serif, Newsreader, Raleway } from "next/font/google";

/** Body text, labels, buttons. */
export const raleway = Raleway({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-raleway",
});

/** Headings and numbers. */
export const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-newsreader",
});

/** Italic accent word ("onboarding") and typed initials. */
export const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-instrument",
});

export const fontVariables = [
  raleway.variable,
  newsreader.variable,
  instrumentSerif.variable,
].join(" ");
