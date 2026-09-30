# Phase 5 — Admin & extensibility

**Status:** Not started · **Goal:** Raju manages people, tools, form fields, templates and defaults without code changes.

**Depends on:** Phase 2 (schema + form engine). Decisions D4 (backup approver), D5 (role-change control).
**Read first:** `PROJECT_PLAN.md` §7, §10 · `design/profile-admin.md`
**Verify with Context7:** Clerk Backend API (invitations, user metadata), Supabase (transactions/RPC for publishing versions), drag-and-drop library if used for ordering.

## Steps

- [ ] **5.1 Users & roles** — `AdminNav`; user table; invite via Clerk invitations with roles; edit roles with segregation-of-duties rules (no self-approver, ≥ 1 approver, change control per D5); deactivate user; all audited.
- [ ] **5.2 Applications catalog** — category tabs, add/rename/move/reorder apps, allowed actions, permission options, retire (kept on history); new requests pick up changes; existing requests keep their snapshot.
- [ ] **5.3 Form fields & versions** — draft version editing, field types/validation/required/applies-to/reportable, publish creates immutable version, field suggestions queue from the assistant.
- [ ] **5.4 RBAC templates** — create/edit templates (apps + permissions + document link); apply on a request → pre-fill matrix and show deviations only.
- [ ] **5.5 Templates & defaults** — default IT owner / approver, company timezone, ticket prefix, SLA definitions and reminder, PDF filename pattern, SharePoint settings placeholder (wired in 7.1).

## Exit criteria
Adding a tool, a field (like Country) or a template in Admin changes new requests only; old requests and PDFs unchanged (tested).

## Session log
- (none yet)
