# Requests list — landing page after sign-in

**Status:** draft for review · Canvas board: *Requests list (landing after sign-in)*

After sign-in, users land here: the list of people (one row per request), with a **New request** button that opens the request form ([main-page.md](main-page.md)).

## Layout (1440px desktop)

1. **Top bar** — same `TopBar` as every signed-in page; "Requests" active.
2. **Header** — eyebrow "Laine onboarding rights", title "Requests", one-line description; actions on the right: **Batch onboarding** (secondary; opens the assistant in batch mode) and **New request** (primary).
3. **Summary tiles** (4): Drafts · In execution · Awaiting Moises · Onboarded this month. Numbers come from the reports definitions in `PROJECT_PLAN.md` §9 (the mockup shows `[#]` placeholders).
4. **Filters** — search (name, email, ticket ID) · ticket type segmented control (All / Onboarding / Offboarding / Access modification) · status · country.
5. **Table** — one row per request, whole row clickable:

| Column | Content |
| --- | --- |
| Employee | Initials avatar, name, work email |
| Ticket | `UAM-YYYY-NNNNNN` |
| Type | Onboarding / Offboarding / Access modification |
| Status | `StatusPill` (Draft, In execution, Awaiting confirmation, Returned, Closed, Cancelled) |
| Country | Agreed v1 field |
| Effective | Effective date; offboarding SLA countdown in signal red when due soon |
| Assignee | IT owner |
| Updated | Relative time |

Pagination at the bottom; default sort: most recently updated.

## Role differences

- **Raju (admin / IT owner):** sees all requests; both action buttons.
- **Moises / backup approver:** do not see this page — they land on their own **Approvals** page instead. See [approver-view.md](approver-view.md).

## Components used
`TopBar`, `Button`, `SummaryTile` (new), `SegmentedControl`, `SelectField`, `SearchField` (new), `RequestTable` (new), `StatusPill`, `Avatar`.
