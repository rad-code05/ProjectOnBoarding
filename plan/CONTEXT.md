# Project context — the whole picture

> **Read this first in every new session** (then `CLAUDE.md` → "Resume here" for the exact next step).
> One page that explains *what* we build, *why*, *how* it fits together and *how we work*. Details live in the linked files — this file links, it does not repeat them.
> Last updated: 2026-10-06.

## 1. What we are building
**Laine onboarding rights** — an internal web app for Laine that replaces the PDF *Laine User Access Management Form v4*.

- **Request types:** onboarding (new person), offboarding (leaver — remove access), access modification (role change).
- **It records:** the request, what IT did, signatures, final approval → a **PDF record** + **reports** + an **audit trail**.
- **It is a system of record, not a provisioning engine:** it never creates accounts in Slack, GitHub, Google etc. Raju still does that by hand and records it here.
- **Users:** a handful of people (Raju, Moises, a backup approver, optionally an auditor). Internal only, invite-only.

**Why:** the PDF form has no audit trail, no reliable dates, no reports, no list of what a leaver still has, and the IT stack changes often. → `PROJECT_PLAN.md` §1, §4.4.

## 2. People, roles and rules
| Person | Roles | Does |
| --- | --- | --- |
| Raju Bholani | admin · requester · it_operator | Creates requests (by hand or with the AI assistant), does the IT work, signs section 9 ("Review & sign"), runs Admin |
| Moises Larez | approver | Confirms, signs & closes at the end — or returns to Raju. Reports, PDFs. Nothing else |
| Backup approver (TBD, D4) | approver | Same as Moises |
| Auditor (optional) | auditor | Read-only |

**Non-negotiable rules:** nobody approves their own request · approval happens **once, at the end** (no pre-provisioning approval) · **dates are server-generated, never typed or backdated** · signature = internal acknowledgment (D13), not a legal e-signature · the AI never approves/signs/submits/closes/changes roles · every action is audited (append-only) · no sign-up page. → `ROLES.md`.

## 3. The workflow
```
draft → in_execution → (Raju: Review & sign) → pending_confirmation → (Moises: Confirm, sign & close) → closed → PDF
                                                        └──(Return to Raju + comment)──► returned → Raju fixes, signs again
any open state → cancelled (reason required)
```
Enforced in the database (F04), not only in the UI. → `PROJECT_PLAN.md` §4.3, §5.

## 4. Main capabilities (v1)
| Capability | In short | Built in |
| --- | --- | --- |
| Request form | The 11 sections of form v4 (+ Country); dense; sections 6–11 collapsed until relevant; apps in two columns | F01–F04 |
| Extensibility | Apps, categories, equipment, form fields are **data** (admin-editable, versioned) — no code change to add a tool | F02, F19–F21 |
| Signatures | PNG or initials from *My profile*; server time; SHA-256 of a frozen snapshot | F05–F07 |
| PDF | React-PDF from the closure snapshot; `firstname.lastname-onboarding.pdf`; Download (+ SharePoint later) | F08, F22 |
| Offboarding / modification | SLA panel, access inventory pre-fills removals | F09–F10 |
| Audit log | Append-only; page with filters + CSV | S6 (table), F11 (page) |
| Reports | Side panel of report types, each with a definition, CSV/PDF | F12–F14 |
| AI assistant | "Laine robot", closed by default; proposes field values, batch onboarding, field suggestions; human approval for writes | F15–F17 |

## 5. Architecture
```
Browser ──HTTPS──► Vercel: Next.js 16 (proxy.ts → pages / Server Actions / Route Handlers)
                     │  requireUser() / requireRole()  ◄── Clerk (sign-in, MFA, session JWT)
                     │  Supabase client + Clerk token ──► Supabase Postgres (RLS by auth.jwt()->>'sub'), Storage
                     │  /api/chat ──► AI provider (D7)        /api/webhooks/clerk ◄── Clerk (signed)
```
- **All data access goes through our server**; the browser never talks to Supabase.
- **Defence in depth:** Clerk session → `requireUser`/`requireRole` on every page/action → table grants → RLS → triggers → audit log.
- **Secret key** (bypasses RLS) only in the Clerk webhook route and `scripts/`.
- → `PROJECT_PLAN.md` §3, §10; stack and versions → `plan/tech-stack.md`.

## 6. Environments and accounts (all on Raju's personal accounts until go-live — D12)
| Thing | Where |
| --- | --- |
| Code | GitHub `rad-code05/ProjectOnBoarding` (**public** — no secrets, no real people's data in commits), `main` protected |
| Hosting | Vercel project `laine-onboarding` → https://laine-onboarding.vercel.app (preview per PR) |
| Sign-in | Clerk app "laine-onboardiing", **Development** instance (`liked-gator-442.clerk.accounts.dev`); Production instance at go-live |
| Database | Supabase `laine-onboarding-dev` (Frankfurt, ref `ssqbumtvxgfovwdsgojr`) used by local dev + Vercel until go-live; `laine-onboarding-prod` at R7; local Docker copy for tests |
| Secrets | `.env.local` (never committed) and Vercel env vars; names in `.env.example` |

## 7. Data model
Built: `app_users`, `user_roles`, `audit_events` (S6) · `employees`, `departments`, `requests`, `form_versions`, `form_fields` (F01) · `catalog_categories`, `catalog_apps`, `request_access_items` (F02a) · `equipment_types`, `physical_access_types`, `request_equipment_items`, `request_physical_access_items` (F03a) · `execution_checklist_items`, `execution_confirmations` + `transition_request()` state machine (F04a). Planned per feature: equipment/physical items, execution confirmations, signature assets, signatures, snapshots, approvals, PDF documents, access inventory, templates, settings. → `PROJECT_PLAN.md` §11 (each table is created by the feature that first needs it).

## 8. How we work (engineering, not vibe coding)
1. **Plan before code:** every piece of work is an item in `plan/` (S1–S7, F01–F23, R1–R7). Open decisions are asked, not guessed.
2. **Vertical slices:** each item brings its own migration + RLS + pgTAP, server logic, UI, tests.
3. **Small pull requests** — see the PR size rules in `plan/README.md`. One concern per PR; big items are split into parts (S6a, S6b, F06a…) **before** building.
4. **Verify APIs with Context7** before writing code; read the version-matched Next.js docs (`AGENTS.md`).
5. **Raju does all git/GitHub steps** (to learn); Claude writes code + docs in the working tree and gives commands with explanations.
6. **CI must be green** (app checks + database/RLS tests) before a squash merge.
7. **Docs stay current:** tick the item + session-log line in its plan file, update `CLAUDE.md` "Resume here", this file if the big picture changes, and Raju's study guide `Rajulearning/Learn.md` (local only).

## 9. Roadmap and where we are
| Stage | Items | Status (2026-10-06) |
| --- | --- | --- |
| Phase 0 — decisions & design | D1–D19, design review | D1, D2, D12, D13 decided; others open (asked when a feature needs them) |
| Phase 1 — walking skeleton | S1 app · S2 CI · S3 design foundation · S4 hosting · S5 sign-in · S6 database & roles · S7 app shell | S1–S7 merged (S6: #12, #13, #15, #16; S7: #18–#20 + S7d); **walking skeleton complete — F01 next** |
| Features | F01–F08 onboarding end-to-end · F09–F11 offboarding, modification, audit page → **go-live possible** · F12–F23 reports, AI, admin, SharePoint, email | not started |
| Release | R1–R7 security, accessibility, monitoring, backups, docs, automated DB deploys, go-live | after F11 |
| Operate | Weekly/monthly/quarterly/yearly routine | after go-live |

## 10. Decisions
Decided: **D1** Clerk email+password+MFA invite-only · **D2** Supabase Frankfurt · **D12** personal accounts, `*.vercel.app` until go-live · **D13** signature = internal acknowledgment. Open: D3 timezone · D4 backup approver · D5 admin role-change control · D6 auditor OK with end-only approval · D7 AI provider/data · D8 batch format · D9 SharePoint · D10 notifications · D11 import old forms · D14 original PDF · D15 Clerk Pro · D16 report metric · D17 RBAC templates · D18 PDF filenames/drafts · D19 go-live sign-off. → `plan/phase-0-discovery.md`, `PROJECT_PLAN.md` §17.

## 11. Document map
| Need | File |
| --- | --- |
| Whole picture | **this file** |
| Exact next step, gotchas, working agreements | `CLAUDE.md` |
| How plan items work, prompts, PR rules, definition of done | `plan/README.md` |
| The items themselves | `plan/phase-0-discovery.md`, `plan/phase-1-skeleton.md`, `plan/features.md`, `plan/release.md` |
| Did we miss anything? | `plan/coverage.md` — every requirement → step → proof → status |
| Libraries, services, env vars | `plan/tech-stack.md` |
| Full requirements and analysis | `PROJECT_PLAN.md` |
| Roles and signing | `ROLES.md` |
| Screens and components | `design/README.md`, `design/*.md`, design canvas (link in `CLAUDE.md`) |
| Raju's learning notes | `Rajulearning/Learn.md` (local only) |

## 12. Starting a new session
> Read plan/CONTEXT.md, CLAUDE.md ("Resume here") and plan/README.md, then work on <item> in <plan file>. I do the git and GitHub steps myself — give me the commands with explanations.
