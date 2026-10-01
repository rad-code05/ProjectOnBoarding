# Phase 1 — Walking skeleton

**Goal:** the thinnest app that goes all the way through: created, checked by CI, deployed, signed in, role-aware, with an empty shell. Nothing more — every table, component and page beyond this is built **by the feature that first needs it** (see `features.md`).

**Before S1 (on Raju's PC):** Node 24 LTS (22 works for S1–S3), pnpm, Docker Desktop (needed from S6) — see `tech-stack.md`.
**Read first:** `CLAUDE.md` · `plan/tech-stack.md` · `PROJECT_PLAN.md` §2–3, §10, §12, §15 · `design/tokens.md` · `design/colours.md` · `design/sign-in.md`
**Verify with Context7:** Next.js 16, Clerk Core 3, Supabase (third-party auth, RLS, CLI), Tailwind v4, Vercel, Vitest, Playwright.

## Steps

- [x] **S1 Create the app** — Next.js 16 (TypeScript strict, App Router, Tailwind v4, ESLint), pnpm, Node version pinned, Prettier, folder layout (`PROJECT_PLAN.md` §12), `.env.example`, Vitest with one smoke test, scripts `lint`, `format:check`, `typecheck`, `test`.
  *Done when:* `pnpm dev` serves the page; all four scripts pass.
- [x] **S2 CI & repo rules** — GitHub Actions running the four scripts + `build` on every PR; Dependabot; PR template with the definition of done; branch protection on `main`.
  *Done when:* a PR shows green checks; `main` requires them.
- [ ] **S3 Design foundation** — `@theme` tokens + fonts from `design/tokens.md`; only the primitives the sign-in page and shell need (Button, IconButton, TextField, PasswordField, InlineError, Notice, Logo, Avatar), each with tests; `/dev/ui` preview (dev only).
  *Done when:* primitives match the Components board; keyboard/ARIA tests pass.
- [ ] **S4 Hosting** *(needs D12)* — Vercel project, Preview per PR, Production on `main`, domain.
  *Done when:* PR preview URL and production URL serve the app.
- [ ] **S5 Sign-in** *(needs D1)* — Clerk: `proxy.ts` + `clerkMiddleware()`, `<ClerkProvider>` in `<body>`, custom sign-in (`useSignIn`), new-device code, reset password, sign-up restricted, sign-out, `requireUser()` on every page.
  *Done when:* invited users sign in/out on preview; signed-out visits redirect to `/sign-in`; Playwright test.
- [ ] **S6 Database, users & roles** *(needs D2; Docker)* — Supabase dev/prod, Clerk third-party auth, server-only client with Clerk token; migration with **only** `app_users`, `user_roles`, `audit_events` (append-only); RLS helpers; pgTAP tests; Clerk webhook sync; `requireRole()`; seed Raju and Moises.
  *Done when:* RLS tests green in CI; roles resolve on the server.
- [ ] **S7 App shell** — `AppShell` + `TopBar` by role, role landing (`/requests` vs `/approvals`), empty pages for the menu items, 403/404 pages, Playwright smoke per role.
  *Done when:* both roles see the right menu and landing page in production.

## Session log
- 2026-10-01 — **S1 done** (branch `s1-create-app`): `create-next-app` 16.3.8 (TS strict, App Router, Tailwind 4.3.3, ESLint 9 flat config, no `src/`), pnpm 12.8.1 with its supply-chain policy (`pnpm-workspace.yaml`), exact version pins, Prettier + Tailwind plugin (docs/design excluded), Vitest 5 + Testing Library + jsdom (native `resolve.tsconfigPaths`), `.env.example`, `.nvmrc` 24, Next's `AGENTS.md` imported from `CLAUDE.md`. TypeScript pinned to 5.9.3 (not 7). lint/format/typecheck/test/build all pass; dev server serves `/`. Folders like `components/`, `lib/`, `supabase/` are created by the step/feature that first needs them. Next: S2 (CI).
- 2026-10-01 — **S2 done** (PR #2, built by Raju): `.github/workflows/ci.yml` (checkout@v7, pnpm/action-setup@v6 reading `packageManager`, setup-node@v7 with `.nvmrc` + pnpm cache; frozen-lockfile install → lint → format:check → typecheck → test → build; ~40 s), Dependabot (weekly npm grouped minor/patch + GitHub Actions), PR template. Ruleset **protect main** active: PR required (0 approvals), required check *Lint, types, tests, build*, no force push, no deletion, empty bypass list. Secret scanning + push protection on; Dependabot alerts + dependency graph on. Lessons: GitHub needs the `workflow` token scope to push workflow files (added to rad-code05); VS Code saves CRLF on Windows → run `pnpm format`. Optional later: allow only squash merges; require branches up to date. Next: S3 (design foundation).
