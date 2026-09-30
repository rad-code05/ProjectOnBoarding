# Main page — Laine onboarding rights

**Status:** draft for review · Canvas board: *Main page · Request form + assistant*

The main page is where a request is filled in — manually or with the AI assistant — following the 11 sections of the access management form.

## Layout (1440px desktop)

`AppShell`:

1. **Top bar (64px, black):** Laine logo · "Laine onboarding rights" · nav: Requests (active: white + signal underline), Reports, Audit log, Admin (admins only) · user block (initials avatar, name, role) · sign-out icon button.
2. **Left rail (248px) — `SectionNav`:** "All requests" back link; ticket card (ticket ID + `StatusPill`); list of the 11 form sections with state indicators; form version note ("Form version 4.1 · Country added").
3. **Centre — the form:**
   - `RequestHeader`: eyebrow "NEW REQUEST · ONBOARDING", employee name as the title, created/saved times, **Save draft** and **Review & sign** buttons.
   - Ticket type `SegmentedControl`: Onboarding · Offboarding · Access modification (drives which sections apply; employment event is derived from it).
   - `AiSuggestionBanner` when the assistant has pending suggestions: count, **Accept all**, **Dismiss**.
   - `FormSection` cards in form order (the draft shows 1 Ticket information, 2 Employee details, 5 Application access).
4. **Right panel (420px) — `AssistantPanel`:** mode switch (This request / Batch onboarding), conversation, `SuggestionCard`, composer with CSV/XLSX attach and send, and the guardrail line "The assistant can't approve, sign, submit or close requests."

## Section states in the rail

| State | Indicator | Example |
| --- | --- | --- |
| Complete | Filled black circle with check | 1 · Ticket information |
| Current / needs attention | Black ring with signal dot, bold, signal sub-text | 2 · Employee details — "1 required field missing" |
| Has AI suggestions | Dashed ring + "3 suggested" | 5 · Application access |
| Not started | Thin ring | 4, 6, 7, 9, 10, 11 |
| Locked (another role completes it) | Lock icon + who | 3 · Final authorization — "Moises signs at the end" |
| Not applicable | Dash, graphite | 8 · Removal SLA — "Offboarding only" |

## Field types in the form

| Type | Look |
| --- | --- |
| Editable | White, 1px field border |
| System / read-only | Sand fill, graphite text, no border (Ticket ID, Status, Opened, Closed, Employment event) |
| AI-suggested | Dashed ink outline, "Suggested" chip, accept ✓ / reject ✕ buttons |
| Required & missing | 2px signal border, `*` on label, message under the field |

## AI assistant flow shown

1. Raju types a free-text description of the new starter.
2. The assistant replies with a `SuggestionCard` (9 values: names, job title, department, country, effective date, 3 applications) — **nothing is saved yet**.
3. The same values appear in the form with the suggested style; Raju accepts all, accepts one by one, or edits.
4. The assistant asks for what's missing (manager).

## Open questions for review

1. Should the section rail scroll the form (one long page, as drawn) or show one section at a time?
2. Is "Review & sign" the right label for Raju's final step (opens the confirmation summary → sign Section 9)?
3. Should the assistant panel be collapsible to give the form more width?
4. Request list page (the landing page after sign-in) vs. opening straight into a new request — which does Raju want first?
