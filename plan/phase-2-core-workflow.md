# Phase 2 — Core workflow

**Status:** Not started · **Goal:** Raju can create, fill and execute onboarding, offboarding and access-modification requests by hand; Moises can review them read-only and return them.

**Depends on:** Phase 1. Decision D3 (timezone) for SLA.
**Read first:** `PROJECT_PLAN.md` §4–5, §7, §10 · `design/request-list.md` · `design/main-page.md` · `design/request-variants.md` · `design/approver-view.md`
**Verify with Context7:** Next.js Server Actions & forms, Zod, Supabase JS (RPC/functions), any table/virtualisation library chosen.

Signing with images and PDFs come in Phase 3. In this phase "Review & sign" and "Confirm" work as confirmations with a checkbox so the full state machine can be tested.

## Steps

- [ ] **2.1 Requests list** — `/requests`: summary tiles, search, type/status/country filters, paginated `RequestTable` with status pills, SLA countdown, PDF marker placeholder; **New request**. Server-side filtering; approvers never reach this page.
- [ ] **2.2 Request form engine** — create request (ticket ID), `FieldRenderer` driven by the stored form version, sections 1–2 (Country included), autosave draft with optimistic locking (`version`), `ConflictAlert` on stale save, audit events per field change.
- [ ] **2.3 Sections 4–7** — provisioning method (RBAC/custom), two-column `AccessMatrix` from the catalog (per-app actions/permissions, e.g. Hexnode Enroll/Remove), "Add other application", equipment, physical & logical access.
- [ ] **2.4 State machine** — DB function for transitions (`draft → in_execution → pending_confirmation → closed`; `pending_confirmation → returned → in_execution` (edit) `→ pending_confirmation` only through signing again; `cancelled` from draft/in_execution), enforced in SQL; `SectionNav` states; collapsed sections 6–11 rules from `design/main-page.md`.
- [ ] **2.5 IT execution (section 9)** — checklist per ticket type, implementation notes, executed by/at (server), move to *Awaiting confirmation* via a temporary confirm step.
- [ ] **2.6 Offboarding** — employee picker, access inventory built from closed requests, pre-filled removals, `SlaPanel` (timeline, due time computed in company timezone, "within SLA" computed), missed-SLA reason required, handover section.
- [ ] **2.7 Access modification** — inventory rows kept / changed / removed + add from catalog.
- [ ] **2.8 Approver area** — `/approvals` (waiting cards, recently closed), read-only request view, **Return to Raju** with required comment → *Returned*; Raju's returned state with the notice and flagged items.
- [ ] **2.9 Cancel & edge cases** — cancel with reason, duplicate-employee warning, empty/loading/error states on all pages.

## Tests
Playwright end-to-end: onboarding happy path, offboarding with SLA, return-and-fix loop, approver cannot open drafts (403) or edit. pgTAP for transition function.

## Exit criteria
Full manual onboarding, offboarding and access modification run end-to-end on a preview (with temporary confirmations); every action audited.

## Session log
- (none yet)
