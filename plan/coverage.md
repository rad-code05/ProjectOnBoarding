# Coverage map — every requirement → where it's built → what proves it

**Purpose:** make sure nothing is missed. Every requirement from `PROJECT_PLAN.md`, `ROLES.md` and the design specs is one row here, mapped to the plan step that builds it (S = skeleton, F = feature, R = release) and the test or check that proves it.
**Created:** 2026-10-07, after S7 (walking skeleton complete). **Keep it current:** every feature PR updates its rows (status + proof) — part of the definition of done (`plan/README.md`).

**Status:** ✅ done and proven · 🟡 partly done (rest planned) · ⏳ planned (step named) · ❓ needs a decision first · ➖ deliberately changed or out of scope (reason given)

Test names: **pgTAP** = `supabase/tests/database/*.test.sql` · **unit** = Vitest `*.test.ts(x)` · **e2e** = Playwright `tests/e2e/*.spec.ts`.

---

## A. Access & security

| # | Requirement | Source | Built in | Proven by | Status |
| --- | --- | --- | --- | --- | --- |
| A1 | Only invited users can sign in; no sign-up page | §10.2, §14, D1 | S5 (Clerk invite-only, sign-up restricted) | Clerk setting; no `/sign-up` route; e2e signed-out redirects | ✅ |
| A2 | Email + password + **MFA required** (authenticator + backup codes) | D1, D15 | S5 | Clerk "Require MFA"; e2e signs in with TOTP (`sign-in.ts`); users without MFA land on `/session-tasks` | ✅ (prod needs Clerk Pro — R7) |
| A3 | New-device email code, reset password, our own sign-in screens | `design/sign-in.md` | S5 | unit `SignInForm.test.tsx`, `authErrors.test.ts`; Raju's manual run | ✅ |
| A4 | Sign-out ends the session | §10.2, §14 | S5, S7a | e2e "sign out ends the session…" | ✅ |
| A5 | Session lifetime + idle timeout | §10.2, §15.3 | S7d (Clerk dev: 12 h / 30 min) | Clerk dashboard | 🟡 dev done; set again in prod (R7) |
| A6 | Every page/route/action checks sign-in **and role on the server** | §3, ROLES | S5–S7 (`requireUser`, `requireRole`, `PAGES`) | unit `lib/auth.test.ts`, `lib/navigation.test.ts`; e2e 403 per role | ✅ for existing pages; each feature adds its own |
| A7 | RLS as defence in depth; Clerk JWT `sub` (text IDs) | §3, §14 | S6 | pgTAP `users_roles_rls` (32) | ✅ for users/roles/audit; ⏳ each new table (F01+) |
| A8 | Service/secret key never in request paths (webhook + scripts only) | §3 #4 | S6 | code review rule; `lib/supabase/admin.ts` only imported by webhook + scripts | ✅ |
| A9 | Wrong role → "no access" (403); unknown page → 404 | `design/records-states.md` | S7b | e2e approver/admin 403, 404 page | ✅ |
| A10 | Role-based menu and start page (Raju → Requests, approver → Approvals) | ROLES, `approver-view.md` | S7a | e2e admin/approver landing + menu | ✅ |
| A11 | Approver never sees drafts / in-execution requests | ROLES, `approver-view.md` | F01b (RLS on `requests`), F01c (list via RLS), F07 | pgTAP `requests_rls`; e2e approver → 403 on `/requests` and `/requests/new` | ✅ database + list; F07 adds the approver views |
| A12 | Nobody approves a request they prepared or executed | ROLES, §10.1 | F07 (server + DB) | pgTAP + e2e (F07 done-when) | ⏳ F07 |
| A13 | Admin can't grant themselves Approver; role changes controlled | §10.1, D5 | S6 (no self-grant check, audited), F18 | pgTAP (S6); F18 tests | 🟡 ❓ D5 |
| A14 | At least one active approver must exist | ROLES "rules that never change" | **F18** (assigned 2026-10-07) | F18 tests | ⏳ F18 |
| A15 | Concurrency: stale saves rejected (`version`) | §10.2 | F01b (DB), F01d (save + conflict message) | pgTAP "a save with an outdated version changes nothing" | 🟡 database ✅, UI ⏳ F01d |
| A16 | Secrets only in env settings; secret scanning + push protection | §10.2 | S2 (GitHub settings) | GitHub secret scanning on | ✅ |
| A17 | Upload validation (PNG only, size/dimensions, re-encode, private bucket) | §8.1 | F05 | F05 tests | ⏳ F05 |
| A18 | Authorization matrix test: every route × role | R1 | R1 (+ e2e grows per feature) | e2e | ⏳ R1 |
| A19 | Security headers / CSP, dependency audit | R1 | R1 | — | ⏳ R1 |

## B. The form (sections 1–11 of form v4)

| # | Requirement | Source | Built in | Proven by | Status |
| --- | --- | --- | --- | --- | --- |
| B1 | Sec. 1 Ticket info: type, auto ticket ID `UAM-YYYY-NNNNNN`, status derived from state, priority, assignee, opened/closed (server time) | §4.1 | F01 (+ F04 status) | F01 tests | ⏳ F01 |
| B2 | Sec. 2 Employee: first/last name (split), job title, department, **Manager and Requestor as separate fields**, effective date, **Country** (required) | §4.1, §4.4 #4–5, §4.5 | F01 | F01 tests | ⏳ F01 |
| B3 | Employment event derived from ticket type (not asked twice) | §4.4 #3 | F01 | F01 tests | ⏳ F01 |
| B4 | Work email as stable employee key (unique) | §4.4 #6, §4.5 | F01b (`employees`, linked by trigger) | pgTAP "a work email creates and links the employee" | ✅ |
| B5 | Sec. 3 → *Final authorization & confirmation* by Moises at the end; "must not be provisioned before…" line removed | §4.1, §5.1 | F07 (+ F08 PDF wording) | F07/F08 tests | ⏳ F07 |
| B6 | Sec. 4 Provisioning method: RBAC template or custom, template name, RBAC document link | §4.1 | F02 (custom), F21 (templates) | F02/F21 tests | ⏳ ❓ D17 |
| B7 | Sec. 5 Application access matrix from the catalog: per-app actions + permissions (Hexnode Enroll/Remove), notes, "Add other application" | §4.1, §4.2 | F02 | F02 done-when | ⏳ F02 |
| B8 | Seed catalog: 4 categories, 26 apps | §4.2 | F02 | seed + test | ⏳ F02 |
| B9 | Each request keeps a snapshot of the catalog entries it used | §7 | F02 | F02 tests | ⏳ F02 |
| B10 | Sec. 6 Equipment: several items, laptop/phone/other (other needs description), issue/return, asset tag | §4.1 | F03 | F03 tests | ⏳ F03 |
| B11 | Sec. 7 Physical & logical access (office, VPN, shared drives) | §4.1 | F03 | F03 tests | ⏳ F03 |
| B12 | Sec. 8 Removal SLA: deadline computed, "within SLA" computed (not self-reported), reason required if missed | §4.1, §4.4 #7, §5.2 | F09 | F09 tests | ⏳ ❓ D3 timezone |
| B13 | Sec. 9 IT execution checklist per ticket type; executed by = signed-in user | §4.1 | F04 | F04 tests | ⏳ F04 |
| B14 | Sec. 10 Final review & closure | §4.1 | F07 | F07 tests | ⏳ F07 |
| B15 | Sec. 11 Signatures (IT half, approver half) | §4.1, §8 | F06, F07 | F06/F07 tests | ⏳ F06 |
| B16 | Default names (assignee Raju, approver Moises) are admin settings, not hard-coded | §4.1 | F21 (defaults) — F01 uses a seeded default | F21 tests | ⏳ F21 |
| B17 | Sections 6–11 collapsed until relevant; section states in the rail | `design/main-page.md` | F03, F04 | e2e | ⏳ F04 |
| B18 | Dense two-column layout; AI-suggested fields dashed | `design/main-page.md` | F01–F02, F16 | e2e / visual check | ⏳ |
| B19 | Deferred extra fields (preferred name, employment type, contract end, handover…) addable later **without code** | §4.5 | F20 (field catalog) | F20 done-when | ⏳ F20 (handover + last working day used in F09) |

## C. Workflow

| # | Requirement | Source | Built in | Proven by | Status |
| --- | --- | --- | --- | --- | --- |
| C1 | States `draft → in_execution → pending_confirmation → closed`, `returned`, `cancelled`; **enforced in the database** | §4.3, §14 | F04 | pgTAP (F04 done-when) | ⏳ F04 |
| C2 | No approval gate before provisioning (Moises signs once, at the end) | §5.1, ROLES | F04/F07 | F07 tests | ⏳ F07 |
| C3 | Every transition writes an audit event | §4.3 | F04 | pgTAP | ⏳ F04 |
| C4 | Cancel with required reason | §4.3 | F04 | F04 tests | ⏳ F04 |
| C5 | Return to Raju with required comment → returned; Raju's signature cleared (kept in audit); sections 1–9 unlock; must sign again | §4.3, ROLES | F07 | F07 done-when | ⏳ F07 |
| C6 | Returned view: Moises's comment, **flagged items**, "Go to…" and **Reply to Moises** | `design/request-variants.md` | **F07** (assigned 2026-10-07) | F07 tests | ⏳ F07 |
| C7 | Any change after Raju signs clears his signature | §8.1 #4, §17 #5 | F06 | F06 tests | ⏳ F06 |
| C8 | Closed requests are never edited — changes go through a new access-modification request | §17 #5 | F04 (DB rule), F10 | pgTAP | ⏳ F04 |
| C9 | Pending confirmations visible to **all** approvers; first to confirm closes; PDF records who | §10.1 | F07, F08 | F07 tests | ⏳ F07 |
| C10 | Offboarding: SLA required at creation, inventory pre-fills removals, countdown on request + list, missed reason before close | §5.2, `request-variants.md` | F09 | F09 tests | ⏳ F09 |
| C11 | Access inventory per employee (built from closed requests) | §4.4 #2, D20 ✅ | F09 | F09 tests | ⏳ F09 (in v1 — D20) |
| C12 | Access modification: keep / change / remove inventory rows + add from catalog | `request-variants.md` | F10 | F10 tests | ⏳ F10 |

## D. Signatures

| # | Requirement | Source | Built in | Proven by | Status |
| --- | --- | --- | --- | --- | --- |
| D-1 | Signature or initials PNG (or typed initials) in My profile; one active; old versions kept | §8.1, D13 | F05 | F05 tests | ⏳ F05 |
| D-2 | Confirmation dialog with blocking checks, read-only summary, confirm checkbox | §8.1, `review-sign.md` | F06 (Raju), F07 (Moises) | e2e | ⏳ F06 |
| D-3 | Server records signer, role, request, form version, **server timestamp**, snapshot SHA-256 (RFC 8785) | §8.1, §14 | F06 | pgTAP + unit | ⏳ F06 |
| D-4 | Only the signed-in user applies their own signature; AI can never sign | §8.1, §6.2 | F06, F15–F17 | pgTAP + AI tool tests | ⏳ F06 |
| D-5 | Never backdate: all dates server-generated, not editable | ROLES, §14 | S6 (triggers), every feature | pgTAP `session_audit` (backdated time overwritten) | 🟡 principle proven; ⏳ per table |

## E. PDF & export

| # | Requirement | Source | Built in | Proven by | Status |
| --- | --- | --- | --- | --- | --- |
| E1 | PDF from the frozen closure snapshot, mirrors the 11 sections, fonts embedded, footer with SHA-256 | §8.2, `records-states.md` | F08 | F08 done-when (hash match) | ⏳ F08 |
| E2 | Filename `firstname.lastname-<type>.pdf` with sanitising (José Müller → jose.muller); storage path includes ticket ID | §8.2, §14 | F08 | unit (filename) | ⏳ ❓ D18 |
| E3 | Every download / SharePoint save is an audit event | §8.2 | F08, F22 | pgTAP/e2e | ⏳ F08 |
| E4 | Closed request page: Download, Preview, signatures card, recent activity; PDF marker in lists | `pdf-export.md` | F08 | e2e | ⏳ F08 |
| E5 | Draft PDF watermark "DRAFT – NOT APPROVED" (if drafts may be exported) | §8.2 | F08 | — | ❓ D18 |
| E6 | Save to SharePoint (Graph, `Sites.Selected`), status + retry | §8.2, `pdf-export.md` | F22 | F22 tests | ❓ D9 |
| E7 | Compare layout against the original form PDF | D14 | F08 | — | ❓ D14 (Raju adds the PDF to `docs/source/`) |

## F. Reports

| # | Requirement | Source | Built in | Proven by | Status |
| --- | --- | --- | --- | --- | --- |
| F-1 | Separate date fields (created, effective, execution started/completed, confirmed, closed, SLA due) | §9.1 | F01, F04, F06, F07, F09 | pgTAP | ⏳ |
| F-2 | Agreed metric definitions ("onboarded" = ?) | §9.2 | F12 | — | ❓ D16 |
| F-3 | All users list, Onboarded by month | §9.3, `reports.md` | F12 | F12 tests | ⏳ F12 |
| F-4 | Onboarded by country / department, Signature log | `reports.md` | F13 | F13 tests | ⏳ F13 |
| F-5 | Offboarding SLA, Access by application, Open requests by status | §9.3, `reports.md` | F14 | F14 tests | ⏳ F14 |
| F-6 | Monthly counts created / submitted / approved / completed / closed by ticket type | §9.3 #1, D21 | later, as a new report type | — | ➖ not now (D21: designed reports are enough for now) |
| F-7 | CSV + PDF export of any report, permission-checked and **audited** | §9.3 #6, `reports.md` | F12 | F12 tests | ⏳ F12 |
| F-8 | Summary tiles on the requests list and approvals page | `request-list.md`, `approver-view.md` | F01c (list), F07 | e2e "requests list: tiles…" | 🟡 list ✅ ("Onboarded this month" waits for D16/F06), approvals ⏳ F07 |

## G. AI assistant

| # | Requirement | Source | Built in | Proven by | Status |
| --- | --- | --- | --- | --- | --- |
| G1 | Robot launcher, closed by default, panel, open/closed remembered per device | `main-page.md` | F15 | e2e | ⏳ ❓ D7 |
| G2 | `/api/chat` rate limit + monthly spend cap | §6.4 | F15 | F15 tests | ⏳ F15 |
| G3 | `proposeFieldValues` → suggestions accepted per field; audit `source = ai` | §6.1, §6.3 | F16 | F16 tests | ⏳ F16 |
| G4 | Read-only `getRequestSummary` / `getCatalog` ("what's still missing?") | §6.1, §6.3 | **F16** (assigned 2026-10-07) | F16 tests | ⏳ F16 |
| G5 | Batch onboarding: CSV/XLSX/paste → batch grid with checks (missing, duplicate, past date) → `createDraftRequests` (`needsApproval`) | §6.1, `request-variants.md` | F17 | F17 tests | ⏳ ❓ D8 |
| G6 | AI can **never** approve, sign, submit, close, cancel, change roles, publish form changes — no such tools exist | §6.2, §14, ROLES | F15–F17 | test that the tool list contains none of them (F17 safety tests) | ⏳ F15 |
| G7 | Uploaded files / pasted text treated as untrusted (prompt injection) | §6.4 | F17 | F17 safety tests | ⏳ F17 |
| G8 | Only needed fields go to the model; never signatures or secrets; provider chosen after data terms | §6.4 | F15 | review + test | ⏳ ❓ D7 |
| G9 | AI field suggestions ("we need a field for X") and catalog suggestions ("add Notion") need admin confirmation | §6.1, §7 | F19 (catalog), F20 (fields) | F19/F20 tests | ⏳ |
| G10 | LangFuse tracing (optional, with redaction) | §2 | — | — | ➖ optional, not planned |

## H. Admin & extensibility

| # | Requirement | Source | Built in | Proven by | Status |
| --- | --- | --- | --- | --- | --- |
| H1 | Users & roles: invite via Clerk, role chips, MFA + last sign-in, SoD rules | `profile-admin.md`, §10.1 | F18 (today: `pnpm users:sync`) | F18 tests | ⏳ ❓ D4, D5 |
| H2 | Applications: add / rename / move / retire (never delete), actions + permission options, reorder, categories — **no code change** | §7 | F19 | F19 done-when | ⏳ F19 |
| H3 | **Equipment types and physical/logical access types** editable the same way | §7 | **F19** (assigned 2026-10-07) | F19 tests | ⏳ F19 |
| H4 | Form fields & versions: draft/publish, request keeps its version, `custom_fields jsonb`; old requests/PDFs unchanged | §7, §14 | F01 (v4.1 seeded), F20 | F20 done-when | ⏳ F20 |
| H5 | RBAC templates as data; applying one pre-fills the matrix | §4.4 #1 | F21 | F21 tests | ⏳ ❓ D17 |
| H6a | **Departments** as an admin-editable list (seed: Engineering, Tech, Sales, Operations, Marketing, Compliance, Admin); retire, never delete | Raju 2026-10-07 | F01b (table + seed), F21 (editing screen) | pgTAP "the seven departments are seeded" | 🟡 list ✅, editing ⏳ F21 |
| H6 | Defaults: IT owner, primary approver, timezone, ticket prefix, SLA definitions, PDF naming | `profile-admin.md` | F21 | F21 tests | ⏳ F21 |
| H7 | Every catalog/field/role change audit-logged; applies to new requests only | §7 | F18–F21 | pgTAP | ⏳ |

## I. Audit log

| # | Requirement | Source | Built in | Proven by | Status |
| --- | --- | --- | --- | --- | --- |
| I1 | Append-only: no update/delete/truncate for anyone (grants + triggers) | §10.2 | S6 | pgTAP `users_roles_rls` | ✅ |
| I2 | Sign-in / sign-out logged | §10.2 | S7c | pgTAP `session_audit`; verified in production 2026-10-06 | ✅ (expiry has no Clerk event) |
| I3 | User and role changes logged | §10.2 | S6 (triggers) | pgTAP | ✅ |
| I4 | Create / edit (field-level before → after) / transitions / sign / export / close logged, with source user/AI/system | §10.2, §14 | F01 onwards, each feature | pgTAP per feature | ⏳ F01 |
| I5 | Audit log page: filters (person, action, source, period), details, CSV export (audited) | `profile-admin.md` | F11 | F11 tests | ⏳ F11 |
| I6 | Per-request activity timeline (request detail "audit timeline", closed page "Recent activity") | §5.3, `pdf-export.md` | **F11** (assigned 2026-10-07; F08 shows the card once F11 exists) | F11 tests | ⏳ F11 |
| I7 | Test users (`e2e.*+clerk_test`) sign in on every CI run → filter them out in the audit page | S7d lesson | F11 | F11 tests | ⏳ F11 |
| I8 | Operational logs (Vercel) with personal data scrubbed; error monitoring | §10.2 | R3 | — | ⏳ R3 |

## J. UI, states & accessibility

| # | Requirement | Source | Built in | Proven by | Status |
| --- | --- | --- | --- | --- | --- |
| J1 | Laine look: tokens, fonts, pill buttons, red = attention only | `design/` | S3 (+ every feature) | unit (components) | ✅ foundation |
| J2 | App shell: top bar by role, profile link, sign-out — desktop and phone (menu button + full-screen menu) | `components.md`, phone boards | S7a, F01a | unit `TopBar.test.tsx` (desktop + phone menu); e2e desktop + `phone.spec.ts` | ✅ |
| J3 | Empty states (requests, approvals), loading skeletons (reduced motion), save conflict "Reload and merge", offline banner | `records-states.md` | the feature that owns each page (F01, F07, F22) | e2e + unit | 🟡 requests list empty / no-match states ✅ (F01c); rest ⏳ |
| J4 | Keyboard + screen reader + contrast (WCAG 2.1 AA) | §12, `design/README.md` | every feature + R2 | unit ARIA tests; R2 pass | 🟡 per feature |
| J5 | Approvals badge (number waiting) in the approver's menu | `approver-view.md` | **F07** (assigned 2026-10-07) | e2e | ⏳ F07 |
| J6 | **Mobile-first**: every screen works on iPhone (regular, Plus, Pro Max) and Galaxy S24 Ultra widths (~390–440 px) and desktop | D22 ✅ | sign-in ✅ (S5); app shell ✅ (**F01a**); every feature designs + tests its phone layout | e2e `phone.spec.ts` on iPhone 17e (WebKit) + Galaxy S24 Ultra (Chromium): menu, no sideways scroll | 🟡 sign-in + app shell done; ⏳ each new screen |
| J7 | Design boards still "draft, awaiting review" | phase 0 step 0.4 | reviewed per feature before building its screens | — | 🟡 |

## K. Engineering practice

| # | Requirement | Source | Built in | Proven by | Status |
| --- | --- | --- | --- | --- | --- |
| K1 | `main` protected; changes only via PR; required checks | §12 | S2, S6, S7d | ruleset *protect main*: 3 required checks | ✅ |
| K2 | "At least one review" per PR | §12 | — | — | ➖ one-person team: Raju reviews; Claude self-reviews; checks are the gate |
| K3 | CI: lint, format, typecheck, unit, RLS (pgTAP), e2e | §12 | S2, S6, S7d | `.github/workflows/ci.yml` | ✅ |
| K4 | E2E "on the Vercel preview" | §12 | S7d | — | ➖ runs on a local build + local Supabase instead (no cloud data touched, no preview protection to bypass) |
| K5 | Dependency audit in CI | §12 | **gap** — Dependabot alerts only | — | ⏳ propose a small CI PR (`pnpm audit --prod` or GitHub dependency review) |
| K6 | ADRs in `docs/adr/` | §12 | — | — | ➖ decisions live in `plan/phase-0-discovery.md`, `PROJECT_PLAN.md` §17 and session logs |
| K7 | Conventional Commits, small PRs | §12, `plan/README.md` | S1 onwards | PR history | ✅ |
| K8 | Exact pinned versions, lockfile, Node LTS | §12 | S1 | `package.json`, `.nvmrc` | ✅ (Node 24 on Raju's PC before go-live) |
| K9 | Separate environments: local → preview → production; separate Supabase + Clerk for prod | §12 | S4–S6 (dev), R7 (prod) | — | 🟡 prod at R7 |
| K10 | Automated database deploys (no manual `db push`) | `release.md` | before R7 | — | ⏳ |

## L. Operations & go-live

| # | Requirement | Source | Built in | Proven by | Status |
| --- | --- | --- | --- | --- | --- |
| L1 | Data region EU-Frankfurt | D2 | S6 | Supabase project | ✅ |
| L2 | Retention rules, backups, PITR, **restore test** | §10.2, D2 | R4 | documented restore | ⏳ ❓ D2 retention |
| L3 | Runbook, admin guide, approver guide | R6 | R6 | — | ⏳ R6 |
| L4 | Laine subdomain, Clerk + Supabase production, paid plans (Vercel/Clerk/Supabase Pro) | R7, D12, D15 | R7 | — | ⏳ ❓ D19 sign-off |
| L5 | Auditor accepts end-only approval | §5.1, D6 | before R7 | — | ❓ D6 |
| L6 | Import past completed forms | §17 #13 | R5 | — | ❓ D11 |
| L7 | Backup approver account (**Celine**, D4 ✅) | §10.1, D4 | Clerk dashboard + `users:sync` before F07 tests | — | ⏳ create account |
| L8 | Moises's real account (approver) | ROLES | before F07 testing | — | ⏳ (create in Clerk + `users:sync`) |

## M. Later (phase 2) and out of scope

| # | Item | Source | Where | Status |
| --- | --- | --- | --- | --- |
| M1 | Email notifications (approver waiting, returned, SLA due) | §13, `records-states.md` | F23 | ⏳ ❓ D10 |
| M2 | Slack notifications, contractor end-date reminders | §13 | not planned yet | ➖ phase 2 — add as F24+ when wanted |
| M3 | SSO (Microsoft 365 / Google) | D1 | later, no redesign needed | ➖ |
| M4 | Automatic provisioning in external tools | §1, §16 | out of scope v1 | ➖ |
| M5 | Optional pre-provisioning approval setting | §5.1 | only if the auditor requires it (D6) | ➖ |

---

## Gaps found on 2026-10-07 and what was done

| Gap | Fix |
| --- | --- |
| "At least one active approver must exist" (ROLES) had no step | Assigned to **F18** (A14) |
| Returned view: flagged items + "Reply to Moises" not in F07's scope | Added to **F07** (C6) |
| Approvals badge in the approver menu had no step | Added to **F07** (J5) |
| Equipment types + physical/logical access types must be admin-editable (§7) — F19 covered apps only | Added to **F19** (H3) |
| Per-request activity timeline (§5.3, closed page) had no step | Added to **F11** (I6) |
| AI read-only lookups (`getRequestSummary`, `getCatalog`) had no step | Added to **F16** (G4) |
| My profile "Manage password & MFA" — users can't change their password or reset their authenticator in our own screens | Added to **F05** |
| Test-user sign-ins fill the audit log | Filter in **F11** (I7) |
| Empty/loading/error states not in any done-when | Cross-cutting rule added to `features.md` (J3) |
| §17 #8 "access inventory in v1?" was never in the decision table | **D20** → resolved: yes, in v1 |
| Report "monthly counts by ticket type" (§9.3 #1) is not in the designed report list | **D21** → resolved: existing reports enough for now |
| Mobile behaviour of the signed-in app is unspecified | **D22** → resolved: mobile-first, phone + desktop; mobile app shell is F01's first part |
| Dependency audit in CI (§12) not set up | Proposed as a small CI PR (K5) |
| §12 asks for PR reviews, E2E on preview, ADRs | Recorded as deliberate changes (K2, K4, K6) |
