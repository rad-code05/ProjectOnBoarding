# Request form — Laine onboarding rights

**Status:** revision 2 for review (2026-09-30) · Canvas board: *Request form + assistant*

Opened from **New request** (or a row) on the [requests list](request-list.md). This is where a request is filled in, manually or with the AI assistant, following the 11 sections of the access management form.

## Decisions (2026-09-30)

- **"Review & sign"** is the final button for Raju (opens the confirmation summary → sign Section 9). ✅
- **Denser layout** to avoid a long page: smaller type throughout (body 12–13px, labels 11px, page title 32px, section titles 19px, fields 36px high) and multi-column grids.
- **Application access in two columns:** left = Core business + Engineering, cloud & data; right = Security, device & identity + Business, finance & operations. All 26 catalog apps are always visible as compact rows.
- **Landing page** after sign-in is the requests list, not this form.

## Layout (1440px desktop)

`AppShell`:

1. **Top bar (60px, black):** logo · "Laine onboarding rights" · Requests (active), Reports, Audit log, Admin (admins only) · user block · sign-out.
2. **Left rail (224px) — `SectionNav`:** back to all requests; ticket card (ID + `StatusPill`); 11 sections with state indicators; form version note.
3. **Centre — the form:**
   - `RequestHeader` on one row: eyebrow, employee name, created/saved; on the right the ticket-type `SegmentedControl`, **Save draft**, **Review & sign**.
   - `AiSuggestionBanner` when suggestions are pending.
   - **01 Ticket information** — 6 fields in one row.
   - **02 Employee details** — 3-column grid (9 fields incl. Country).
   - **05 Application access** — two-column `AccessMatrix` (below).
   - **06–11 are collapsed** into one-line rows (see *Collapsed sections* below).
4. **Assistant — closed by default, opened from the Laine robot (decision 2026-09-30):**
   - **Closed:** the form uses the full width. A round **Laine robot** button floats bottom-right (fixed to the viewport). When the assistant has pending suggestions it shows a signal badge with the count and a small speech bubble ("Hi Raju — 9 suggestions ready").
   - **Open:** clicking the robot opens the 380px `AssistantPanel` on the right (header: robot avatar, "Laine assistant", close button; mode switch This request / Batch onboarding; conversation; `SuggestionCard`; composer with CSV/XLSX attach; guardrail line). Close returns to the robot.
   - Open/closed state is remembered per user on that device. **Batch onboarding** on the requests list opens the panel directly in batch mode.

## Application access matrix

- Grouped by catalog category, split across two columns so the full list fits without scrolling far.
- Each row: app name · **Action** select (from that app's allowed actions, e.g. Hexnode: Enroll/Remove) · **Permission** select (that app's options).
- Rows with no action show "—" in grey; rows with a value are bold.
- AI-suggested rows get the dashed outline (same rule as suggested fields).
- Notes open per row (expand) instead of a permanent Notes column, to keep rows compact.
- Footer: **Add other application** (custom app on this request), **Apply RBAC template**.
- Categories and apps come from the admin-managed catalog — adding a tool in Admin adds a row here with no code change.

## Collapsed sections (decision 2026-09-30)

Sections 1, 2, 4 and 5 are open while preparing a request. Sections 6–11 are collapsed to a 50px row (number, title, status note, chevron) and open only when relevant:

| Section | Default | Opens |
| --- | --- | --- |
| 06 IT equipment | Collapsed | Any time (click) |
| 07 Physical & logical access | Collapsed | Any time (click) |
| 08 Access removal SLA | Collapsed, locked on onboarding / access modification | Open by default on offboarding |
| 09 IT execution confirmation | Locked | When the request moves to *In execution* |
| 10 Final review & closure | Locked | For Moises, when the request is *Awaiting confirmation* |
| 11 Signatures & sign-off | Locked | From the **Review & sign** confirmation dialog |

Clicking a section in the left rail opens it and scrolls to it. Locked rows show a lock icon and say when they open; the button uses `aria-expanded` / `aria-disabled`.

## Section states in the rail

| State | Indicator | Example |
| --- | --- | --- |
| Complete | Filled black circle with check | 1 · Ticket information |
| Current / needs attention | Black ring + signal dot, bold, signal sub-text | 2 · Employee details — "1 required field missing" |
| Has AI suggestions | Dashed ring + "3 suggested" | 5 · Application access |
| Not started | Thin ring | 4, 6, 7, 9, 10, 11 |
| Locked (another role) | Lock icon + who | 3 · Final authorization — "Moises signs at the end" |
| Not applicable | Dash, graphite | 8 · Removal SLA — "Offboarding only" |

## Field types

| Type | Look |
| --- | --- |
| Editable | White, 1px field border |
| System / read-only | Sand fill, graphite text (Ticket ID, Status, Opened, Closed, Employment event) |
| AI-suggested | Dashed ink outline, "Suggested" chip, accept ✓ / reject ✕ |
| Required & missing | 2px signal border, `*`, message under the field |

## Laine robot (assistant launcher)

Canvas board: *Laine assistant robot*. Black rounded head, sand face screen, black eyes with highlights, pale-yellow cheeks, signal-red antenna tip. Inline SVG (one component, `RobotAvatar`, with an `expression` prop).

| State | Look |
| --- | --- |
| Idle | Default face |
| Hover / focus | "Happy" arc eyes, bigger smile, 2px black ring, tooltip "Open assistant" |
| Suggestions ready | Signal badge with count |
| Thinking | Three dots on the face screen, pulsing (respect `prefers-reduced-motion`) |

Button: 68px circle, white, soft shadow, `aria-label` includes the pending count.
