# Release (go-live)

**When:** after S1–S7 and F01–F11 (onboarding, offboarding, access modification, approvals, PDF, audit log). Features F12+ ship after go-live, each through the same PR process.

Security and accessibility are checked **in every feature**; this is the final review, not the first.

## Checklist
- [ ] **R1 Security review** — authorization matrix test (every route × role), RLS review, upload validation, headers/CSP, dependency audit; fix findings.
- [ ] **R2 Accessibility pass** — keyboard-only run of every flow; screen-reader labels; contrast; reduced motion.
- [ ] **R3 Observability** — error monitoring with personal-data scrubbing, uptime check.
- [ ] **R4 Data protection** *(D2)* — retention/deletion rules, backups + point-in-time recovery (needs Supabase **Pro**; PITR is a paid add-on), **restore test done and documented**.
- [ ] **R5 Import** *(D11, optional)* — past completed forms as closed records.
- [ ] **R6 Docs** — runbook (incidents, restore, secret rotation), admin guide for Raju, one-page guide for Moises.
- [ ] **R7 Go-live** — Laine subdomain (e.g. `access.laine.ai`) pointed at Vercel; decide whether to transfer Vercel/Supabase/Clerk from personal to Laine-owned accounts (D12); Clerk production instance (needs the Laine domain) and plan for MFA (D15); production invites (Raju, Moises, backup), production seed (catalog, form v4.1), smoke test, sign-off by Raju (and Moises for the approver flow). Auditor OK on end-only approval (D6). **Supabase:** new project `laine-onboarding-prod` (Frankfurt) on the **Pro** plan, paired with the Clerk production instance (third-party auth + Supabase integration), `supabase db push` of all migrations, Clerk webhook endpoint for production, `pnpm users:sync` for the production roles.

**Before R7 — automate database deploys:** today migrations reach the cloud with a manual `supabase db push`. Add a GitHub Actions job that runs `supabase db push` to production after a merge to `main` (with `SUPABASE_ACCESS_TOKEN` + DB password as GitHub secrets, and a manual approval environment), so code and database can't drift apart. Vercel Preview/Production use `laine-onboarding-dev` until R7, then Production switches to `laine-onboarding-prod`.

## Go-live running costs (to approve before R7)
| Service | Why it must be paid in production |
| --- | --- |
| Vercel **Pro** | Hobby is for non-commercial use only (S4). |
| Clerk **Pro** | Authenticator-app MFA + backup codes in the production instance (D15). |
| Supabase **Pro** | Free projects **pause after ~1 week without activity** and have no usable backups; Pro gives daily backups (R4). Point-in-time recovery is an extra add-on — decide in R4. |

## Operate — the routine after go-live
| How often | What | Who |
| --- | --- | --- |
| Weekly | Merge Dependabot minor/patch PRs (CI green); check Dependabot + secret-scanning alerts | Raju |
| Per major upgrade | One PR each (e.g. TypeScript 6, `@types/node` majors, Next/Clerk/AI SDK majors) after checking support — currently parked: PR #4, #5 | Raju + Claude |
| Monthly | Check Vercel/Supabase/Clerk/AI usage and costs; review error monitoring; check backups exist | Raju |
| Quarterly | Restore test from backup (R4); review users & roles (remove leavers); rotate secret keys (runbook R6) | Raju (+ Moises for the role review) |
| Yearly | Node.js LTS upgrade (`.nvmrc`, Vercel, CI, Raju's PC); review data retention (D2) | Raju + Claude |
| On request | New apps/fields in Admin (no code); new features as F24+ in `features.md`, same PR process | Raju |

Also before go-live, on Raju's PC: Node.js 24 LTS (currently 22.12 — `tech-stack.md`).

## Session log
- (none yet)
