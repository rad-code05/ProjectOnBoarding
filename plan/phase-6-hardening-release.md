# Phase 6 — Hardening & release

**Status:** Not started · **Goal:** production-ready, reviewed and documented; Raju and Moises using it for real.

**Depends on:** Phases 1–5. Decisions D2 (retention), D6 (auditor), D11 (import of past forms).
**Read first:** `PROJECT_PLAN.md` §10, §14, §16
**Verify with Context7:** Supabase backups / PITR, Vercel production settings, error-monitoring SDK chosen.

## Steps

- [ ] **6.1 Security review** — authorization matrix test (every route × role), RLS review, upload validation, secret handling, headers/CSP, dependency audit; fix findings.
- [ ] **6.2 Accessibility & UX pass** — keyboard-only run of every flow, screen-reader labels, contrast, reduced motion; fix findings.
- [ ] **6.3 Observability** — error monitoring with personal-data scrubbing, uptime check, structured server logs.
- [ ] **6.4 Data protection** — retention/deletion jobs per D2, backup + point-in-time recovery enabled, **restore test performed and documented**.
- [ ] **6.5 Import (optional, per D11)** — import past completed forms as closed records with their PDFs.
- [ ] **6.6 Documentation** — runbook (incidents, restore, rotating secrets), admin guide for Raju, one-page guide for Moises.
- [ ] **6.7 Go-live** — production accounts (Clerk invites for Raju, Moises, backup), production data seed (catalog, form v4.1, templates), smoke test, sign-off.

## Exit criteria
Acceptance criteria in `PROJECT_PLAN.md` §14 all met; go-live signed off by Raju (and Moises for the approver flow).

## Session log
- (none yet)
