# Features — built one vertical slice at a time

Each feature is a **vertical slice**: its own migrations + RLS + pgTAP tests, server logic (Zod-validated, `requireRole`, audit events), UI built from shared components (new components are added here when first needed), and Playwright tests. It is shippable on its own. Large features are split into PR-sized parts (F06a, F06b…) in the session that builds them.

Order matters: each feature lists what it needs. **After F08 the onboarding flow works end-to-end; after F11 the app can go live** (`release.md`). Later features ship after go-live.

Every feature's done-when also includes: accessible (keyboard + screen reader), authorization tested per role, no secrets, docs/specs updated, **empty / loading / error states** for the pages it adds (`design/records-states.md`), and its rows in **`plan/coverage.md`** updated (status + proof). **Mobile-first (D22):** every page works at phone widths (~390–440 px: iPhone regular/Plus/Pro Max, Galaxy S24 Ultra) and on desktop; the phone layout is designed before the screen is built, and its browser tests also run on a phone viewport.

---

### F01 — Requests list & onboarding draft
**Needs:** S7. **Design:** `design/request-list.md`, `design/main-page.md` (sections 1–2) + **phone layouts** for both (D22). **First part (F01a): mobile app shell** — the top bar today is desktop-only; on phones it needs a compact bar with a menu button, plus a Playwright phone project (iPhone + Galaxy S24 Ultra viewports).
**Builds:** tables `employees`, `requests` (ticket ID `UAM-YYYY-NNNNNN`, `version`), `form_versions`/`form_fields` seeded with v4.1 (incl. Country); `/requests` list (search, filters, tiles); **New request**; form engine (`FieldRenderer`) for sections 1–2; autosave draft with optimistic locking; audit events per change.
**Done when:** Raju creates Anna Keller as a draft and finds her in the list; Moises gets 403 on drafts.

### F02 — Application access
**Needs:** F01. **Design:** `design/main-page.md` (section 5), `PROJECT_PLAN.md` §4.2.
**Builds:** `catalog_categories`, `catalog_apps` seeded (26 apps, per-app actions/permissions), `request_access_items`; section 4 (provisioning method) and the two-column `AccessMatrix`, "Add other application".
**Done when:** Raju sets Slack/Figma/Google Workspace on a draft; Hexnode offers Enroll/Remove.

### F03 — Equipment & physical access
**Needs:** F01. **Builds:** `request_equipment_items`, `request_physical_access_items`; sections 6–7 (collapsed by default).

### F04 — IT execution & workflow states
**Needs:** F02, F03. **Design:** `design/main-page.md` (rail, collapsed sections).
**Builds:** state machine as a SQL function (`draft → in_execution → pending_confirmation …`), `execution_confirmations`, section 9 checklist, `SectionNav` states, collapsed sections 6–11 rules, cancel with reason.
**Done when:** invalid transitions are rejected by the database (pgTAP).

### F05 — My profile & signatures
**Needs:** S7. **Design:** `design/profile-admin.md` (profile).
**Builds:** `signature_assets`, private Storage bucket + policies, PNG upload (sharp re-encode), typed initials, active asset, history; account card with **Manage password & MFA** in our own screens (change password, reset authenticator, new backup codes — Clerk custom flows).

### F06 — Review & sign (Raju)
**Needs:** F04, F05. **Design:** `design/review-sign.md`.
**Builds:** `request_snapshots` (RFC 8785 canonical JSON + SHA-256), `signatures`; dialog with checks; lock sections 1–9; → *Awaiting confirmation*.

### F07 — Approvals (Moises)
**Needs:** F06. **Design:** `design/approver-view.md`, `design/request-variants.md` (read-only, returned).
**Builds:** `approvals`; `/approvals` (tiles, **badge with the number waiting** in the menu, empty state); read-only request; **Confirm & sign** (sections 3, 10, approver half of 11) → closed; **Return to Raju** with comment (+ **flagged items**) → returned view with the comment, "Go to…" and **Reply to Moises** → Raju edits and signs again. Queue visible to every approver; first to confirm closes.
**Done when:** the full loop works for both outcomes; nobody can approve their own request.

### F08 — PDF record & export
**Needs:** F07. **Design:** `design/records-states.md` (PDF), `design/pdf-export.md`.
**Builds:** `pdf_documents`; React-PDF document (2+ A4 pages) from the `closure` snapshot; closed request page; `/records`; authorised download; PDF marker in lists.
**Done when:** `anna.keller-onboarding.pdf` downloads and matches the snapshot hash. ✅ *Onboarding is usable end-to-end.*

### F09 — Offboarding
**Needs:** F08. **Design:** `design/request-variants.md`.
**Builds (D20 ✅ in v1):** `employee_access_inventory` (from closed requests), offboarding variant: SLA panel (timezone **D3**), pre-filled removals, equipment return, handover, missed-SLA reason.

### F10 — Access modification
**Needs:** F09. Inventory rows kept / changed / removed + add from catalog.

### F11 — Audit log page
**Needs:** F01 (events are written from F01 on). **Design:** `design/profile-admin.md` (audit log). Filters, before/after details, CSV export (audited), **per-request activity timeline** (request page + "Recent activity" on the closed page), filter/hide the e2e test users (`e2e.*+clerk_test`). ✅ *Go-live possible — see `release.md`.*

### F12 — Reports I
**Needs:** F08. **Design:** `design/reports.md`. Report side panel, "All users list", "Onboarded by month" (chart + table), CSV/PDF export, definitions.

### F13 — Reports II
"Onboarded by country", "by department", "Signature log".

### F14 — Reports III
"Offboarding SLA" (needs F09), "Access by application", "Open requests by status".

### F15 — Assistant shell
**Needs:** F02. **Decision:** D7. **Design:** `design/main-page.md` (robot). `/api/chat`, rate limit + spend cap, robot launcher + panel (closed by default).

### F16 — Field suggestions
`proposeFieldValues` → suggested fields, accept/reject, audit `source = ai`; read-only tools `getRequestSummary` / `getCatalog` ("what's still missing?"); enables the AI check in Review & sign.

### F17 — Batch onboarding
**Decision:** D8. **Design:** `design/request-variants.md` (batch). Upload, parse, batch grid with checks, `createDraftRequests` (`needsApproval`); safety tests (no forbidden tools, prompt injection).

### F18 — Admin: users & roles
**Decision:** D4, D5. Clerk invitations, role editing with segregation-of-duties rules; **at least one active approver must always exist** (block removing/deactivating the last one).

### F19 — Admin: applications
Catalog editor (add/rename/move/retire) for **applications, equipment types and physical/logical access types** (§7), assistant catalog suggestions.

### F20 — Admin: form fields & versions
Draft/publish versions, field suggestions from the assistant.

### F21 — Admin: templates & defaults
`rbac_templates`; apply a template on a request; defaults, SLA settings, PDF naming.

### F22 — Save to SharePoint
**Decision:** D9. Microsoft Graph upload with `Sites.Selected`; status + retry; optional auto-save on close.

### F23 — Email notifications & reminders
**Decision:** D10. Resend templates (approver waiting, returned, SLA due); scheduled SLA reminders.

## Session log
- (none yet)
