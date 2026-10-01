# Release (go-live)

**When:** after S1–S7 and F01–F11 (onboarding, offboarding, access modification, approvals, PDF, audit log). Features F12+ ship after go-live, each through the same PR process.

Security and accessibility are checked **in every feature**; this is the final review, not the first.

## Checklist
- [ ] **R1 Security review** — authorization matrix test (every route × role), RLS review, upload validation, headers/CSP, dependency audit; fix findings.
- [ ] **R2 Accessibility pass** — keyboard-only run of every flow; screen-reader labels; contrast; reduced motion.
- [ ] **R3 Observability** — error monitoring with personal-data scrubbing, uptime check.
- [ ] **R4 Data protection** *(D2)* — retention/deletion rules, backups + point-in-time recovery, **restore test done and documented**.
- [ ] **R5 Import** *(D11, optional)* — past completed forms as closed records.
- [ ] **R6 Docs** — runbook (incidents, restore, secret rotation), admin guide for Raju, one-page guide for Moises.
- [ ] **R7 Go-live** — Laine subdomain (e.g. `access.laine.ai`) pointed at Vercel; decide whether to transfer Vercel/Supabase/Clerk from personal to Laine-owned accounts (D12); Clerk production instance (needs the Laine domain) and plan for MFA (D15); production invites (Raju, Moises, backup), production seed (catalog, form v4.1), smoke test, sign-off by Raju (and Moises for the approver flow). Auditor OK on end-only approval (D6).

## Session log
- (none yet)
