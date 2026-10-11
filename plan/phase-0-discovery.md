# Phase 0 — Discovery & sign-off

**Status:** In progress · **Goal:** every decision that blocks building is answered, and the design is signed off.

**Read first:** `CLAUDE.md` · `PROJECT_PLAN.md` §17 · `design/README.md`

## Steps

- [x] **0.1 Plan** — `PROJECT_PLAN.md` written and reviewed.
- [x] **0.2 Roles & workflow** — Raju admin/IT, Moises approver only, backup approver role, end-only approval, no backdating, Country field.
- [x] **0.3 Design — all screens drafted** (31 boards, specs in `design/`).
- [ ] **0.4 Design review** — Raju reviews every "draft, awaiting review" board; changes applied; `design/README.md` statuses set to Approved.
- [ ] **0.5 Decisions** — answer the table below and record answers in `PROJECT_PLAN.md` §17 and `CLAUDE.md`.

| # | Decision | Blocks |
| --- | --- | --- |
| ~~D1~~ | ✅ **Resolved 2026-10-01:** Clerk, email + password, MFA required, invite-only; no SSO for now | — |
| D2 | ✅ Region **resolved 2026-10-01: EU – Frankfurt**. Still open: retention for records, signatures, PDFs | R4 |
| D3 | Company timezone for reports and SLAs (assumed Europe/Zurich) | F09, F12 |
| ~~D4~~ | ✅ **Resolved 2026-10-07:** backup approver = **Celine** (account + email in Clerk, never in the repo). App users for now: Raju, Moises, Celine; more can be added later | — (Clerk invite before F07 tests) |
| D5 | How admin role changes are controlled (second admin vs logged + visible to approvers) | F18 |
| D6 | Auditor OK with end-only approval (no pre-provisioning approval)? | R |
| D7 | AI provider & model (Claude direct vs via OpenRouter), may employee data be sent, retention | F15 — **part 1 decided 2026-10-09:** Anthropic; model chosen in Admin (default Claude Sonnet 5.5); assistant fills / updates forms, creates reports, answers data questions (PROJECT_PLAN §6.5). **Open:** employee data to Anthropic, terms, retention |
| D8 | Batch input format (CSV, XLSX, pasted text) | F17 |
| D9 | SharePoint: download only / Save button / automatic; site, library, folder; who does the Entra app registration | F22 |
| D10 | Notifications: email (Resend) and/or Slack; v1 or later | F23 |
| D11 | Import past completed forms? | R |
| ~~D12~~ | ✅ **Resolved 2026-10-01:** default `*.vercel.app` URL for now (Laine subdomain before go-live); Vercel, Supabase and Clerk on Raju's personal accounts (consider transfer to Laine before go-live) | — |
| ~~D13~~ | ✅ **Resolved 2026-09-30:** internal acknowledgment only (record of the process), not legally binding; PNG signature or initials (PNG or typed) | — |
| D15 | **Clerk plan at go-live:** authenticator-app MFA + backup codes are Clerk *Pro* features (free in the development instance). Keep MFA required (paid plan in production) vs. password + device-trust email code only (free) vs. Microsoft/Google SSO later. Recommendation: keep MFA. | R7 |
| D14 | Add the original form PDF (*User Onboarding and Offboarding Form v4*) to `docs/source/` so the PDF layout can be compared | F08 |
| D16 | Report metric: "onboarded this month" = execution completed (proposed), final review, or closure? (`PROJECT_PLAN.md` §9.2, §17 #3) | F12 |
| D17 | RBAC templates: where is the current RBAC document, and store templates as data? (§4.4 #1, §17 #7) | F21 (F02 uses "custom" until then) |
| D18 | PDF filenames for offboarding / access modification (proposed `-offboarding.pdf`, `-access-modification.pdf`); may drafts be exported (watermarked)? (§8.2, §17 #12) | F08 |
| D19 | Who signs off go-live (Raju alone, or Raju + Moises / management)? (§17 #14) | R7 |
| ~~D20~~ | ✅ **Resolved 2026-10-07: yes** — access inventory in v1; offboarding pre-fills everything the person holds (from closed requests) | — (F09) |
| ~~D21~~ | ✅ **Resolved 2026-10-07:** the designed reports are enough for now; "monthly counts by ticket type" (§9.3 #1) may be added later as a new report type (the report list is data-driven) | — |
| ~~D22~~ | ✅ **Resolved 2026-10-07: desktop and phone, mobile-first.** Every screen must work on iPhone (regular ~390–393 px, Plus/Pro Max ~428–440 px) and Samsung Galaxy S24 Ultra (~412 px), as well as desktop. Mobile layouts are designed per screen before it is built; browser tests run on a phone viewport too. | S7 shell (mobile top bar), every feature |

## Exit criteria
D1, D2 (region) and D12 answered ✅ — S4–S6 are unblocked; design board statuses approved or accepted as-is.

## Session log
- 2026-09-30 — Plan, roles, workflow, full design drafted; repo created.
