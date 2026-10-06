# Delivery plan — Laine onboarding rights

**Start here:** [CONTEXT.md](CONTEXT.md) — the whole picture (what, why, architecture, how we work, where we are).
**Tech stack:** [tech-stack.md](tech-stack.md) — every framework, library, service, tool and environment variable, with versions and the step/feature that introduces each.

We build **feature by feature**: first a thin walking skeleton, then one vertical slice at a time (database + security + server + UI + tests for one feature), each shippable on its own.

| Stage | File | What | Status |
| --- | --- | --- | --- |
| Phase 0 | [phase-0-discovery.md](phase-0-discovery.md) | Decisions D1–D19, design review | In progress (D1, D2, D12, D13 done) |
| Phase 1 | [phase-1-skeleton.md](phase-1-skeleton.md) | **S1–S7** walking skeleton: app, CI, design foundation, hosting, sign-in, users & roles, app shell | In progress (S1–S6 done, S7 next) |
| Features | [features.md](features.md) | **F01–F23**, in order. After F08 onboarding works end-to-end; after F11 the app can go live | Not started |
| Release | [release.md](release.md) | **R1–R7** final review and go-live (after F11), then **Operate** (routine after go-live) | Not started |

One skeleton step or feature = one branch = one pull request = roughly one session. A large item is split into parts (S6a, F06a, F06b) **before** building — see the PR size rules below.

## Pull request size rules
Small PRs are easier to review, safer to merge and easier to undo.
- **One concern per PR.** Database (migration + RLS + pgTAP) · server/app code · UI · docs-only changes are separate PRs when they're more than a few lines each.
- **Size:** aim for **≤ ~400 changed lines**, not counting the lockfile and generated files (`database.types.ts`). Bigger → split.
- **Split at the start of the session:** the session proposes the parts (e.g. S6a database, S6b app code), Raju agrees, then each part gets its own branch and PR, merged in order. A later part branches from `main` **after** the earlier part is merged.
- **Every PR stays green on its own:** lint, types, tests, build and the database job pass for each part — no "fixed in the next PR".
- **Docs travel with their change:** the plan tick + session-log line go in the PR that finishes the item; cross-cutting plan/process changes go in their own `docs-…` PR.
- **Branch names:** `s6a-database`, `s6b-roles-webhook`, `f06a-snapshots`, `docs-project-context`.

## Copy-paste prompts

Open VS Code in the `Project_Onboarding` folder first (so `CLAUDE.md` loads automatically).

**Work on a step or feature**
> Read plan/CONTEXT.md, CLAUDE.md and plan/README.md, then work on S1 in plan/phase-1-skeleton.md. Check what it needs and open decisions first, propose how to split it into small PRs, verify APIs with Context7. I do the git and GitHub steps myself — give me the commands with explanations. Update the checklist and session log when done.

(Replace `S1 in plan/phase-1-skeleton.md` with e.g. `F04 in plan/features.md`.)

**Continue unfinished work**
> Read CLAUDE.md, then continue F04 in plan/features.md. Check the session log and the open branch/PR to see where we stopped.

**Answer decisions (Phase 0)**
> Read CLAUDE.md and plan/phase-0-discovery.md. Go through the open decisions one by one with me and record my answers in PROJECT_PLAN.md §17, the phase 0 file and CLAUDE.md.

**Change a design**
> Read CLAUDE.md and design/README.md. I want to change the [screen name]: [what to change]. Update the canvas, the spec in design/, and the copy in design/canvas/.

**End of session**
> Before we stop: tick finished items, add a session-log line to the plan file, update CLAUDE.md if any decision changed, commit and push.

## What every session does
1. Read `plan/CONTEXT.md`, `CLAUDE.md`, this file, the plan file, and the docs listed under **Read first** / **Design**. Propose the PR split for the item.
2. Check that everything under **Needs** is actually built (look at the code, not only the ticks). If not, **stop and tell the user** what to do first. If an open decision blocks the work, ask.
3. **Verify every library API with Context7** before writing code.
4. **Raju creates the branch** (`s3-design-foundation`, `f04-it-execution`, …). The session implements the whole slice in the working tree (migrations + RLS + pgTAP, server logic, UI, tests) and runs lint, format, typecheck, tests and build locally.
5. The session gives Raju the commands (with explanations) to commit, push and open the PR; CI must be green before Raju squash-merges. `main` is protected — nothing goes in without a PR.
6. Tick the item, add a **Session log** line, update `CLAUDE.md` if a decision changed, and add the step's lessons and new terms to `Rajulearning/Learn.md` (local only — git-ignored).

## Definition of done (every step and feature)
- Works end-to-end for its slice; tests added (unit, RLS/pgTAP, Playwright as relevant).
- Authorization enforced on the server (`requireUser`/`requireRole` + RLS), tested per role.
- Audit events for every state-changing action.
- Accessible: keyboard, labels, contrast.
- UI uses tokens and shared components (`design/`); new shared components documented in `design/components.md`.
- Migrations reviewed; no secrets in the repo; CI green.
