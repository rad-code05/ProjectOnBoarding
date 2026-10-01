# Delivery plan — Laine onboarding rights

**Tech stack:** [tech-stack.md](tech-stack.md) — every framework, library, service, tool and environment variable we use, with versions and the phase that introduces each.

One file per phase. Each phase is split into **numbered steps**; one step = one branch = one pull request, sized for one working session.

| Phase | File | Goal | Status |
| --- | --- | --- | --- |
| 0 | [phase-0-discovery.md](phase-0-discovery.md) | Close open decisions, sign off the design | In progress |
| 1 | [phase-1-foundation.md](phase-1-foundation.md) | App skeleton, auth, database, CI, deploys, design system | Not started |
| 2 | [phase-2-core-workflow.md](phase-2-core-workflow.md) | Requests list, request form, all ticket types, approver flow | Not started |
| 3 | [phase-3-records.md](phase-3-records.md) | Signatures, Review & sign, Confirm & sign, PDF, audit log, reports | Not started |
| 4 | [phase-4-ai-assistant.md](phase-4-ai-assistant.md) | Laine robot assistant, suggestions, batch onboarding | Not started |
| 5 | [phase-5-admin.md](phase-5-admin.md) | Users & roles, applications, form fields, templates & defaults | Not started |
| 6 | [phase-6-hardening-release.md](phase-6-hardening-release.md) | Security, accessibility, backups, go-live | Not started |
| 7 | [phase-7-after-launch.md](phase-7-after-launch.md) | SharePoint save, email notifications, reminders (v1.1+) | Not started |

Phases 4 and 5 can run in either order after Phase 3. Until Phase 5, catalog/users/fields come from seed data and the Clerk dashboard.

## Copy-paste prompts

Open VS Code in the `Project_Onboarding` folder first (so `CLAUDE.md` loads automatically).

**Work on a step**
> Read CLAUDE.md and plan/README.md, then work on plan/phase-1-foundation.md step 1.1. Check dependencies and open decisions first, verify APIs with Context7, use a branch and open a PR. Update the phase file's checklist and session log when done.

**Continue an unfinished step**
> Read CLAUDE.md, then continue plan/phase-1-foundation.md step 1.4. Check the session log and the open branch/PR to see where we stopped.

**Answer decisions (Phase 0)**
> Read CLAUDE.md and plan/phase-0-discovery.md. Go through the open decisions one by one with me and record my answers in PROJECT_PLAN.md §17, the phase 0 file and CLAUDE.md.

**Change a design**
> Read CLAUDE.md and design/README.md. I want to change the [screen name]: [what to change]. Update the canvas, the spec in design/, and the copy in design/canvas/.

**End of session**
> Before we stop: tick finished steps, add a session-log line to the phase file, update CLAUDE.md if any decision changed, commit and push.

## How to start a session
Say, for example:

> Read `CLAUDE.md`, then work on `plan/phase-1-foundation.md`, step **1.4**.

The session should then:
1. Read `CLAUDE.md`, the phase file, and the design/plan documents the step lists under **Read first**.
2. Check that the phase's **Depends on** phases are actually built (look for the code, not just ticked boxes). If they aren't, **stop and tell the user** which step to do first. Check open decisions; if one blocks the step, ask before building.
3. **Verify every library API with Context7** before writing code (the phase file lists which libraries).
4. Create a branch `phase-N/N.M-short-name`, implement, add tests, run lint / typecheck / tests locally.
5. Open a pull request (push as `rad-code05`), fill in the checklist, link the step.
6. Update the phase file: tick the step, add a line to **Session log**, and update `CLAUDE.md` if a decision changed.

## Definition of done (every step)
- Acceptance points of the step met; tests added (unit, RLS/pgTAP, or Playwright as relevant).
- Authorization enforced on the server (`auth.protect()` + role check + RLS), never only in the UI.
- Audit events written for every state-changing action.
- UI uses tokens and shared components from `design/` — no one-off styling.
- Migrations reviewed; no secrets in the repo; CI green.
