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
| D1 | Clerk (recommended) vs Supabase Auth; SSO with Google Workspace or Microsoft 365? MFA required? | S5 |
| D2 | Supabase region (data residency) and retention for records, signatures, PDFs | S6, R4 |
| D3 | Company timezone for reports and SLAs (assumed Europe/Zurich) | F09, F12 |
| D4 | Name/email of the backup approver | F18 (can invite via Clerk dashboard earlier) |
| D5 | How admin role changes are controlled (second admin vs logged + visible to approvers) | F18 |
| D6 | Auditor OK with end-only approval (no pre-provisioning approval)? | R |
| D7 | AI provider & model (Claude direct vs via OpenRouter), may employee data be sent, retention | F15 |
| D8 | Batch input format (CSV, XLSX, pasted text) | F17 |
| D9 | SharePoint: download only / Save button / automatic; site, library, folder; who does the Entra app registration | F22 |
| D10 | Notifications: email (Resend) and/or Slack; v1 or later | F23 |
| D11 | Import past completed forms? | R |
| D12 | Domain for the app (e.g. `access.laine.ai`) and who owns Vercel/Supabase/Clerk accounts & billing | S4 |
| ~~D13~~ | ✅ **Resolved 2026-09-30:** internal acknowledgment only (record of the process), not legally binding; PNG signature or initials (PNG or typed) | — |
| D14 | Add the original form PDF (*User Onboarding and Offboarding Form v4*) to `docs/source/` so the PDF layout can be compared | F08 |

## Exit criteria
D12 answered before S4, D1 before S5, D2 before S6 (S1–S3 can start now); design board statuses approved or accepted as-is.

## Session log
- 2026-09-30 — Plan, roles, workflow, full design drafted; repo created.
