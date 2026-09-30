# Design tokens

## Colors

| Token | Hex | Use |
| --- | --- | --- |
| `sand` | `#F4F0EA` | Page background; read-only field fill; assistant suggestion card |
| `ink` | `#000000` | Text, primary buttons, top bar, brand panel |
| `stone` | `#7e7e7e` | Secondary text **on black only**; input placeholders |
| `signal` | `#cf2e2e` | Errors, required-missing, current-section dot, active nav underline, brand rule |
| `graphite` | `#535353` | Secondary text on sand or white (laine.ai body grey) |
| `paper` | `#FFFFFF` | Cards, inputs, assistant panel |
| `line` | `#dcd4c7` | Card borders, dividers |
| `field-border` | `#cfc7ba` | Input borders |
| `line-subtle` | `#ece6db` | Table row dividers |
| `suggest` | `#f9e4b4` | "Suggested" / "AI" chip and "Awaiting confirmation" status (from laine.ai) |
| `step-border` | `#8a8378` | Not-started section indicator ring |

The first four are the colors specified by the product owner; the rest are supporting neutrals taken from laine.ai or derived from sand.

### Contrast rules
- `stone` (#7e7e7e) on `sand` is ~3.5:1 — **fails** for body text. Use `graphite` (#535353) for small text on sand/white. `stone` is fine on black (~5.2:1).
- `signal` (#cf2e2e) on sand/white is ~4.5:1 — OK for 12px+ semibold error text; never for long body copy.
- Colors that carry meaning also differ in shape: suggested = dashed outline, error = 2px solid border + message, complete = filled check.

## Typography

| Role | Font | Size / weight |
| --- | --- | --- |
| Display (sign-in hero) | Newsreader 400 | 72px / 1.02, tracking −0.02em (mobile 40px) |
| Page title | Newsreader 400 | 42px / 1.05 |
| Section / card title | Newsreader 400 | 22–24px |
| Accent word | Instrument Serif italic 400 | inherits size |
| Body | Raleway 400/500 | 14–15px / 1.5 |
| Label | Raleway 600 | 12–13px |
| Eyebrow | Raleway 600 | 11–12px, uppercase, tracking 0.12–0.18em |
| Button | Raleway 600 | 13–15px |

Fonts are the ones laine.ai loads (Raleway, Newsreader, Instrument Serif).

## Shape and spacing

| Token | Value |
| --- | --- |
| `radius-pill` | 100px — buttons, chips, segmented controls, avatars |
| `radius-field` | 10px — inputs |
| `radius-card` | 14px — section cards (12px for smaller cards/notices) |
| Spacing scale | 4 · 8 · 12 · 16 · 18 · 22 · 24 · 28 · 32 · 40 · 56 · 64 px |
| Control heights | 44px default field/button · 52px sign-in button · 36px compact |
| Layout | Top bar 64px · section rail 248px · assistant panel 420px · content max fluid |

## Implementation (verified with Context7, 2026-09-30)

Fonts via `next/font/google` exposed as CSS variables, mapped into Tailwind v4 with `@theme`:

```ts
// app/fonts.ts
import { Raleway, Newsreader, Instrument_Serif } from 'next/font/google'

export const raleway = Raleway({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-raleway', display: 'swap' })
export const newsreader = Newsreader({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-newsreader', display: 'swap' })
export const instrumentSerif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-instrument', display: 'swap' })
```

```css
/* app/globals.css */
@import 'tailwindcss';

@theme {
  --color-sand: #F4F0EA;
  --color-ink: #000000;
  --color-stone: #7e7e7e;
  --color-signal: #cf2e2e;
  --color-graphite: #535353;
  --color-paper: #FFFFFF;
  --color-line: #dcd4c7;
  --color-field-border: #cfc7ba;
  --color-line-subtle: #ece6db;
  --color-suggest: #f9e4b4;
  --color-step-border: #8a8378;

  --radius-pill: 100px;
  --radius-field: 10px;
  --radius-card: 14px;
}

@theme inline {
  --font-sans: var(--font-raleway);
  --font-serif: var(--font-newsreader);
  --font-accent: var(--font-instrument);
}
```

This yields utilities such as `bg-sand`, `text-graphite`, `border-line`, `rounded-pill`, `font-serif`. Exact import names (`Instrument_Serif`) and package versions are confirmed at Foundation.
