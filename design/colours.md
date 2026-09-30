# Design colours — Laine onboarding rights

Quick reference for everyone building screens, PDFs or emails. Follows [laine.ai](https://laine.ai). Implementation (Tailwind `@theme`, fonts) is in [tokens.md](tokens.md).

## Brand colours (given by the product owner)

| Name | Hex | Use it for |
| --- | --- | --- |
| **Sand** | `#F4F0EA` | Page background; read-only / system field fill; assistant suggestion card; robot face |
| **Ink** | `#000000` | Text, primary buttons, top bar, brand panel, section bars in the PDF, chart bars |
| **Stone** | `#7e7e7e` | Secondary text **on black only** (top bar, brand panel); placeholders; faded chart bars on hover |
| **Signal** | `#cf2e2e` | Attention only: errors, required-but-missing, returned status, SLA due/missed, active-nav underline, notification badge, robot antenna, sign-in brand rule, "PDF" tag |

## Supporting colours

| Name | Hex | Use it for |
| --- | --- | --- |
| **Graphite** | `#535353` | Small secondary text on sand or white (labels, hints, table headers) |
| **Paper** | `#FFFFFF` | Cards, inputs, dialogs, assistant panel |
| **Line** | `#dcd4c7` | Card borders, dividers |
| **Field border** | `#cfc7ba` | Input and select borders |
| **Line subtle** | `#ece6db` | Table row dividers, chart grid, skeletons, email background |
| **Suggest** | `#f9e4b4` | "Suggested" / "AI" chips, *Awaiting confirmation* status, robot cheeks |
| **Step border** | `#8a8378` | "Not started" ring in the section list; drag handles |
| **Top-bar divider** | `#333333` | Hairlines and outlined buttons on black |

## Rules

1. **Red means attention — nothing else.** Never use signal for decoration, headings or large fills.
2. **Stone is for black backgrounds only.** On sand/white it's ~3.5:1 contrast and fails for small text — use graphite there.
3. **Signal text** on sand/white is ~4.5:1 — fine for 12px+ semibold messages, not for body paragraphs.
4. **Never colour alone.** Every meaning also has a shape or word: suggested = dashed outline + chip, error = 2px border + message, complete = filled check, SLA result = "Met" / "Missed".
5. **AI is always marked** with the suggest yellow chip and a dashed ink outline until a person accepts it.
6. **The Laine logo is white** — only place it on ink (top bar, brand panel, PDF header, email header).
7. **No other colours** (no gradients, no extra accents). Charts are single-series ink; hover fades other bars to stone.

## Status colours

| Status | Look |
| --- | --- |
| Draft | White, 1px ink outline |
| In execution | Ink fill, white text |
| Awaiting confirmation | Suggest fill, ink text |
| Returned | Signal outline, signal text |
| Closed | Sand fill, graphite text |
| Cancelled | Sand fill, graphite text, struck through |

## Fonts (for reference)
Raleway (body, labels, buttons) · Newsreader (headings, numbers) · Instrument Serif italic (accent word, typed initials).
