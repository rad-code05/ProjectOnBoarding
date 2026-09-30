# Phase 7 — After launch (v1.1+)

**Status:** Not started · **Goal:** integrations and automation once the core is in daily use.

**Read first:** `design/pdf-export.md` · `design/records-states.md` (emails)
**Verify with Context7:** Microsoft Graph (`/microsoftgraph/microsoft-graph-docs-contrib`: `PUT …/content`, `Sites.Selected`), Resend, Vercel Cron (or Supabase scheduled functions), Slack API if chosen.

## Steps

- [ ] **7.1 Save to SharePoint** (per D9) — Entra app registration with `Sites.Selected` + write grant on the one site; server upload of the closed PDF to `IT / Access records / <year>`; `SharePointStatus` (saving/saved/failed + retry); optional automatic save on close; audited.
- [ ] **7.2 Email notifications** (per D10) — Resend templates from the Email notifications board: waiting for approver, returned to Raju, SLA due; user notification preferences.
- [ ] **7.3 Scheduled reminders** — SLA reminder before due, overdue alerts, contractor end-date reminders (if a contract-end field is added).
- [ ] **7.4 Slack notifications** (optional).
- [ ] **7.5 Deferred form fields** — revisit the deferred fields list (`PROJECT_PLAN.md` §4.5) with real usage.

## Session log
- (none yet)
