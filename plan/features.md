# Features — built one vertical slice at a time

Each feature is a **vertical slice**: its own migrations + RLS + pgTAP tests, server logic (Zod-validated, `requireRole`, audit events), UI built from shared components (new components are added here when first needed), and Playwright tests. It is shippable on its own. Large features are split into PR-sized parts (F06a, F06b…) in the session that builds them.

Order matters: each feature lists what it needs. **After F08 the onboarding flow works end-to-end; after F11 the app can go live** (`release.md`). Later features ship after go-live.

Every feature's done-when also includes: accessible (keyboard + screen reader), authorization tested per role, no secrets, docs/specs updated, **empty / loading / error states** for the pages it adds (`design/records-states.md`), and its rows in **`plan/coverage.md`** updated (status + proof). **Mobile-first (D22):** every page works at phone widths (~390–440 px: iPhone regular/Plus/Pro Max, Galaxy S24 Ultra) and on desktop; the phone layout is designed before the screen is built, and its browser tests also run on a phone viewport.

---

### F01 — Requests list & onboarding draft ✅ (done 2026-10-08)
**Needs:** S7. **Design:** `design/request-list.md`, `design/main-page.md` (sections 1–2) + **phone layouts** for both (D22). **Split (2026-10-07):** - [x] **F01a mobile app shell** (#23) · - [x] **F01b database** (#24) · - [x] **F01c requests list** (#26) · **F01d new request + form sections 1–2**, split again (2026-10-07, too big for one PR): - [x] **F01d-1 form engine** (#27: zod, draft schema, `FieldRenderer`) · - [x] **F01d-2 new request page** (#28: create draft, form page, Save draft with version check) · - [x] **F01d-3** autosave, changed-elsewhere banner, section chips, collapsed sections 3–11.
**Decided 2026-10-07:** ticket ID `UAM-YYYY-NNNNNN` with the number **restarting each year** (`UAM-2027-000001`), year from the server date in the company timezone; **department = admin-editable list** (seed: Engineering, Tech, Sales, Operations, Marketing, Compliance, Admin — `departments` table, data not code; editing screen in F21, adding one before F21 = a seed migration); **manager and requestor = typed names** (only Raju, Moises and Celine use the app).
**Builds:** tables `employees`, `departments`, `requests` (ticket ID `UAM-YYYY-NNNNNN` from a per-year counter, `version`), `form_versions`/`form_fields` seeded with v4.1 (incl. Country); `/requests` list (search, filters, tiles); **New request**; form engine (`FieldRenderer`) for sections 1–2; autosave draft with optimistic locking; audit events per change.
**Done when:** Raju creates Anna Keller as a draft and finds her in the list; Moises gets 403 on drafts.

### F02 — Application access
**Needs:** F01. **Design:** `design/main-page.md` (section 5), `PROJECT_PLAN.md` §4.2 + phone boards *Phone · Sections 4–5* and *Phone · Edit an app (bottom sheet)* (approved 2026-10-08). **Split (2026-10-08):** - [x] **F02a database** (#30: catalog + 26 apps + `request_access_items`, RLS, pgTAP) · - [x] **F02b sections 4–5** (desktop grid, phone list + sheet) · - [ ] **F02c Add other application** (if F02b is too big). Section 4 stays "Custom / exception" until D17 / F21.
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
`rbac_templates`; apply a template on a request; defaults, SLA settings, PDF naming; **departments list** (add / rename / retire — retired ones stay on old requests).

### F22 — Save to SharePoint
**Decision:** D9. Microsoft Graph upload with `Sites.Selected`; status + retry; optional auto-save on close.

### F23 — Email notifications & reminders
**Decision:** D10. Resend templates (approver waiting, returned, SLA due); scheduled SLA reminders.

## Session log
- 2026-10-07 — **F01a mobile app shell**: phone boards *Phone · App shell (menu closed / open)* approved by Raju on the canvas (copied to `design/canvas/`). `TopBar` is mobile-first: below `md` (768 px) a 56 px bar (logo, "Onboarding rights", avatar → My profile, 44 px menu button) and a full-screen menu (`#phone-menu`: Newsreader 28 px links, current = white + signal dot, profile row, Sign out; focus moves in, Esc closes and returns focus, body scroll locked, choosing a page closes it); from `md` the desktop bar. New icons `MenuIcon`, `CloseIcon`, `ChevronRightIcon`; phone padding in `AppShell`/`PagePlaceholder`. Tests: 77 unit (4 new); Playwright projects **iphone** (iPhone 17e, 390 px, **WebKit**) and **galaxy-s24-ultra** (412 px, Chromium) running `phone.spec.ts` (menu per role, navigation, Esc, no sideways scroll on pages/403/404) — 22 browser tests. Lessons: (1) the phone menu first closed itself inside the link's click, removing the link mid-navigation — slow WebKit sometimes lost the navigation; now the menu belongs to the page it was opened on and closes when the URL changes (derived state, no effect). (2) WebKit is slow under load, very slow on Windows → `workers` (CI 2, local 4), `expect` 10 s, and the `iphone` project runs **after** all others with a 60 s test timeout. Three full runs green (22/22). CI installs Chromium + WebKit. Unit tests: 78.
- 2026-10-07 — **F01b database**: migration `20261007120000_requests_draft.sql` — enums `request_type` / `request_state` / `request_priority`; `departments` (7 seeded, data not code), `form_versions` + `form_fields` (v4.1 current, 17 fields of sections 1–2, immutable once published), `employees` (unique work email; created/linked by trigger from the request), `requests` (ticket ID `UAM-YYYY-NNNNNN` from `private.ticket_counters`, one atomic counter per year in the company timezone — D3 still assumed Europe/Zurich; `version` +1 on every save; ticket ID / creator / form version immutable; state changes refused until F04; server timestamps; never deleted). Audit: `request.created`, `request.updated` with before → after per field, `employee.created`. RLS: IT side + auditors read all; **approvers only `pending_confirmation` / `returned` / `closed`**; requesters create drafts only in their own name; IT side edits open requests. pgTAP `requests_rls.test.sql` (26) — 62 database tests in total. Types regenerated. **After merge:** `supabase db push` to the cloud DB before F01c deploys.
- 2026-10-07 — **Flaky iPhone browser test (after #23/#24):** CI marked `phone.spec.ts` flaky; locally WebKit was also very slow (a 19 s page load with two WebKit browsers). The CI failure report then showed the real cause: after Clerk's script loaded, every request said `x-clerk-auth-reason: session-token-but-no-client-uat` → signed out → `/sign-in`. **WebKit drops Clerk's `__client_uat` cookie on plain-http `localhost`** (Chromium keeps it), so the session was lost on the first page change — a test-setup limit, not an app bug (production and previews are https; Raju checked on his iPhone). Fix: the `iphone` project (iPhone 17e size, touch, mobile) runs in **Chromium**; CI no longer installs WebKit; real Safari is checked by hand on the https preview. Lesson: read the response headers in the trace — Clerk says why it signed someone out.
- 2026-10-07 — **F01c requests list**: phone boards *Phone · Requests list* + *(empty)* approved (in `design/canvas/`). `/requests`: header with **New request** (→ `/requests/new` placeholder until F01d) and **Batch onboarding** (disabled until F17); tiles Drafts / In execution / Awaiting Moises / Onboarded this month ("—" until signing exists, D16); filters in the URL (`q` every word must match name/email/ticket, `type`, `status`, `country`, `limit`) via `RequestFilters` (client, 300 ms search pause); `RequestList` = cards on phone, table on desktop (whole row clickable, PDF marker for closed); `NoRequestsYet` (robot) / `NoMatchingRequests`; **Show more** (+20). Data: `listRequests` + `requestSummary` (tiles + countries in **one** query) through RLS. New UI: `StatusPill`, `SummaryTile`. Tests: 100 unit (`filters`, `format`, `RequestList`, `RequestFilters`), 26 browser (list tiles, filters in the URL, New request, approver 403 on `/requests/new`, phone list without sideways scroll). Lessons: (1) Clerk's session token lives ~60 s — tests now `openApp()` = goto + `clerk.loaded()` before clicking; (2) a **Safari user agent** makes Clerk's dev instance take its Safari path, which Chromium can't complete — the `iphone` project keeps iPhone size/touch with an Android user agent (8/8 failed → 8/8 passed); (3) unit `testTimeout` 15 s (jsdom start-up on a busy PC); (4) fewer database round trips = faster pages (Supabase is in Frankfurt; consider Vercel functions in `fra1`).
- 2026-10-07 — **F01d-1 form engine + F01d-2 new request page**: phone boards *Phone · Request form (sections 1–2)* and *(changed elsewhere)* approved by Raju (in `design/canvas/`, spec in `design/main-page.md` → Phone layout: on a phone only sections 1–2 open). **New request** is now a form (POST → Server Action `createDraft`) instead of a link, so a prefetch can never create a draft; `/requests/new` placeholder removed. `/requests/[id]` (`requireRole` → approvers 403, unknown/invisible → 404) loads the request, its form version's `form_fields` (sections 1–2, `applies_to` the type), departments, IT operators (assignee) and 249 ISO countries (`lib/requests/form.ts`). `RequestForm` + `FieldRenderer` draw the fields from the rows (8 field types; 48 px / 16 px on phones so iPhone does not zoom); ticket type = the switch at the top; employment event follows it. **Save draft** → `saveDraft`: zod 4 (`lib/requests/draft.ts`: empty = null, trimmed, email lower-cased, ISO date, known country, department ID) → `update … where id and version = loaded` → no row = changed elsewhere (message + reload). Audit by the DB trigger. Tests: 112 unit (`draft.test.ts`, `FieldRenderer.test.tsx` new); browser: "New request creates a draft; Raju saves Anna Keller and finds her", approver 403 on a request page, phone form (16 px fields, Save draft visible, no sideways scroll) — 29 browser test runs incl. the 2 sign-in setups. Lessons: (1) two foreign keys join `user_roles` and `app_users`, so the embed needs a hint (`app_users!user_roles_clerk_user_id_fkey!inner`); (2) the phone list cards and desktop table both hold the name — tests pick the visible one (`getByRole("table")`); (3) one phone test failed once in a full run and passed 10/10 after — watch it in CI; (4) local browser tests write to the cloud dev DB (each run adds a draft) — hiding test users is F11.
- 2026-10-08 — **F01d-3 autosave, changed-elsewhere box, section navigation** (F01 done): `useAutosave` saves 1.5 s after the last change, one save at a time (a change during a save waits and goes next, with the version the last save returned), stops after a conflict; leaving with unsaved changes asks first (`beforeunload`). Save draft = save now. The approved *changed elsewhere* box (`ChangedElsewhere`: what you typed, **Load the latest version**, **Copy my change**; form dimmed and locked). `SectionNav`: chips on a phone, left rail on desktop, states complete / to fill / locked / not started from the `required` flag of `form_fields`; a fresh draft says "N to fill" in graphite — red stays for the Review & sign check (F06). Sections 3–11 = `CollapsedSection` rows (locked with who/when: 3 Moises, 8 offboarding only, 9–11 later steps; others open to "Coming with F0x"); `lib/requests/sections.ts` holds the 11 sections. New `CheckIcon`. Tests: 117 unit (`useAutosave.test.ts` with a fake clock: one save after the pause, version chaining, nothing after a conflict, field errors); browser: Anna Keller now saved **without clicking**, **two tabs → changed somewhere else** (and Load the latest version shows the other tab’s value), phone chips jump to and open section 5. Lesson: a hook that calls itself again is flagged by the React Compiler lint (`react-hooks/immutability`) — a loop that drains the waiting values is simpler anyway.
- 2026-10-08 — **F02a database**: migration `20261008120000_application_access.sql` — `catalog_categories` (4) and `catalog_apps` (26, each with its own `actions` / `permissions` arrays; Hexnode = Enroll / Remove; `active` to retire, never deleted; read-only until the admin screens, F19); `request_access_items` (one row per app per request, `app_id` null = "Other" app; **snapshot** `app_name` / `category_name` set by the database so renaming an app never changes old records; action and permission checked against the app’s own options; retired apps can’t be added; request and app of a row can’t change; server timestamps). Audit: `request.access_added` / `_changed` (before → after) / `_removed`. RLS: rows visible exactly when their request is (approvers never see drafts’ apps); IT side adds/changes/removes only while the request is open. Rows save on their own (no request `version` bump) so the sections 1–2 autosave isn’t disturbed. pgTAP `access_items_rls.test.sql` (23) — 85 database tests. Types regenerated. **After merge:** `supabase db push` to the cloud DB before F02b deploys.
- 2026-10-08 — **F02b sections 4–5**: phone boards *Phone · Sections 4–5* + *Phone · Edit an app (bottom sheet)* approved (in `design/canvas/`, spec in `design/main-page.md`). Section 4 = `ProvisioningSection` (Custom / exception; RBAC template greyed out until D17 / F21). Section 5 = `AccessSection` from the catalog (`lib/requests/access.ts`, loaded with the form): phone list + `AppDialog` bottom sheet (native `<dialog>`), desktop two-column grid (`columns-2`) with Action / Permission selects (permission waits for an action), the app name opens the dialog for notes; **Find an app** + **All / Set** filter; each choice saves at once via `setAccess` / `clearAccess` (select, then update or insert; the database checks the app's options and copies the name), shown immediately and undone if refused; "Saving…" status until stored. Section chips: 4 complete, 5 "N apps set". Tests: 122 unit (`AccessSection.test.tsx`: Hexnode only Enroll / Remove, choosing saves and counts, permission waits); browser: **"Raju sets Slack, Figma and Google Workspace; Hexnode offers Enroll / Remove"** (survives a reload), phone sheet Figma → Grant · Editor; 31 browser test runs. Lesson: under heavy load old tests failed on page aborts and a reload raced the last save — the new "Saving…" status gives people and tests a clear "stored" signal; `getByRole("status")` now needs `.first()` (two status lines).
