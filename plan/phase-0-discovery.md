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
| D1 | Clerk (recommended) vs Supabase Auth; SSO with Google Workspace or Microsoft 365? MFA required? | 1.4 |
| D2 | Supabase region (data residency) and retention for records, signatures, PDFs | 1.5, 6.x |
| D3 | Company timezone for reports and SLAs (assumed Europe/Zurich) | 2.6, 3.7 |
| D4 | Name/email of the backup approver | 5.1 (can invite via Clerk dashboard earlier) |
| D5 | How admin role changes are controlled (second admin vs logged + visible to approvers) | 5.1 |
| D6 | Auditor OK with end-only approval (no pre-provisioning approval)? | 6.x |
| D7 | AI provider & model (Claude direct vs via OpenRouter), may employee data be sent, retention | 4.1 |
| D8 | Batch input format (CSV, XLSX, pasted text) | 4.4 |
| D9 | SharePoint: download only / Save button / automatic; site, library, folder; who does the Entra app registration | 7.1 |
| D10 | Notifications: email (Resend) and/or Slack; v1 or later | 7.2 |
| D11 | Import past completed forms? | 6.x |
| D12 | Domain for the app (e.g. `access.laine.ai`) and who owns Vercel/Supabase/Clerk accounts & billing | 1.8 |
| D13 | Signature legal weight: internal acknowledgment (working assumption) or legally binding e-signature | 3.2, 3.3 |
| D14 | Add the original form PDF (*User Onboarding and Offboarding Form v4*) to `docs/source/` so the PDF layout can be compared | 3.4 |

## Exit criteria
All decisions that block Phase 1 (D1, D2, D12) answered; design board statuses approved or accepted as-is.

## Session log
- 2026-09-30 — Plan, roles, workflow, full design drafted; repo created.
