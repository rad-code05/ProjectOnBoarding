# ProjectOnBoarding — Laine onboarding rights

Internal web application for Laine's user access management: onboarding, offboarding, and access modification requests, with IT execution tracking, sign-off, PDF export, reports, and an AI-assisted data-entry panel.

**Status:** building the walking skeleton (see [plan/](plan/README.md)).

## Run it locally
Requires Node ≥ 22.12 (Node 24 LTS recommended, see `.nvmrc`) and pnpm.

```sh
pnpm install
cp .env.example .env.local   # fill in values when sign-in/database arrive (S5/S6)
pnpm dev                     # http://localhost:3000
```

Checks: `pnpm lint` · `pnpm format:check` · `pnpm typecheck` · `pnpm test` · `pnpm build`.

- [CLAUDE.md](CLAUDE.md) — **start here**: one-page summary of all decisions, roles, open questions and next steps.
- [ROLES.md](ROLES.md) — who does what (Raju, Moises, backup approver), permissions and signing rules.
- [design/colours.md](design/colours.md) — the colour palette and rules.
- [plan/](plan/README.md) — delivery phases 0–7 with numbered steps (one step = one PR).
- [PROJECT_PLAN.md](PROJECT_PLAN.md) — scope, stack, workflow, data model, delivery phases, and open decisions.
- [design/](design/README.md) — design tokens, reusable components, and a spec for each screen; canvas sources in `design/canvas/`.

Planned stack: Next.js 16 (App Router, TypeScript), Clerk, Supabase (Postgres + Storage), Vercel, Vercel AI SDK, Tailwind CSS v4.
