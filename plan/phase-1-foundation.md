# Phase 1 — Foundation

**Status:** Not started · **Goal:** a deployed, signed-in, empty app with the database, security model, CI and design system in place.

**Depends on:** Phase 0 decisions D1, D2, D12.
**Read first:** `CLAUDE.md` (stack gotchas) · `PROJECT_PLAN.md` §2–3, §10–12, §15 · `design/tokens.md` · `design/components.md` · `design/sign-in.md`
**Verify with Context7 before coding:** Next.js 16 (`/vercel/next.js`), Clerk (`/clerk/clerk-docs`), Supabase (`/websites/supabase_guides`), Tailwind v4 (`/websites/tailwindcss`), Vercel (`/vercel/vercel`), Vitest, Playwright, Zod.

## Steps

- [ ] **1.1 Scaffold the app**
  - `create-next-app` (TypeScript, App Router, Tailwind v4, ESLint, `src/` optional — decide once), pnpm, pinned Node LTS (`.nvmrc` + `engines`), Prettier, strict `tsconfig`.
  - Folder layout from `PROJECT_PLAN.md` §12; `.env.example` with every variable (no values).
  - *Done when:* `pnpm dev` runs; lint, format check and typecheck pass.

- [ ] **1.2 CI and repo rules**
  - GitHub Actions: install (frozen lockfile) → lint → format check → typecheck → Vitest → build. Secret scanning + dependency audit.
  - Branch protection on `main` (PR + passing checks). PR template with the definition-of-done checklist.
  - *Done when:* a PR shows all checks green.

- [ ] **1.3 Design system**
  - `globals.css` `@theme` tokens and `next/font` (Raleway, Newsreader, Instrument Serif) exactly as `design/tokens.md`.
  - UI primitives from `design/components.md`: Button, IconButton, TextField, PasswordField, SelectField, DateField, Checkbox, SegmentedControl, StatusPill, Chip, InlineError, Notice, Card, Avatar, Logo, Dialog, Toast, Skeleton.
  - A dev-only `/dev/ui` page showing every primitive and state; Vitest + Testing Library tests for keyboard/ARIA behaviour.
  - *Done when:* components match the Components board; accessibility checks pass.

- [ ] **1.4 Authentication (Clerk Core 3)**
  - `@clerk/nextjs`; `proxy.ts` with `clerkMiddleware()`; `<ClerkProvider>` inside `<body>`.
  - Custom sign-in (`AuthLayout` + `BrandPanel` + `SignInForm` using `useSignIn()` → `signIn.password()` / `signIn.finalize()`), new-device code (`needs_client_trust`), reset password — per `design/sign-in.md`.
  - Sign-up mode **Restricted** in the Clerk dashboard; no sign-up route. Sign-out from the top bar.
  - Helper `requireUser()` that every page/route/action calls (`auth.protect()`).
  - *Done when:* invited user can sign in/out on a preview; signed-out access to any page redirects to `/sign-in`; Playwright test covers it.

- [ ] **1.5 Supabase project & security model**
  - Dev and prod projects in the agreed region; Supabase CLI locally with `[auth.third_party.clerk]` in `config.toml`; Clerk "Connect with Supabase" (role claim).
  - Server-only Supabase client with `accessToken()` → Clerk token; **no browser client**; service key only in scripts/migrations.
  - Migration 0001: `app_users`, `user_roles`, `settings`; SQL helpers `current_user_id()` (`auth.jwt() ->> 'sub'`) and `has_role(text)`.
  - pgTAP test harness (`supabase test db`) with first RLS tests.
  - *Done when:* RLS tests pass in CI against a local Supabase.

- [ ] **1.6 User sync & roles**
  - Clerk webhook (verified) → upsert `app_users`; seed Raju as admin/requester/IT operator, Moises as approver.
  - Server helper `requireRole(...roles)`; role-based landing (`/` → `/requests` for IT, `/approvals` for approvers); 403 and 404 pages (`design/records-states.md`).
  - *Done when:* each role lands on the right page; wrong role gets 403; tests cover both.

- [ ] **1.7 Core schema & seed data**
  - Migrations for `employees`, `requests` (state enum, `version` for optimistic locking, all date columns), `request_access_items`, `request_equipment_items`, `request_physical_access_items`, `approvals`, `execution_confirmations`, `signatures`, `signature_assets`, `request_snapshots`, `catalog_categories`, `catalog_apps`, `rbac_templates(+_items)`, `form_versions`, `form_fields`, `field_suggestions`, `employee_access_inventory`, `pdf_documents`, `audit_events` (see `PROJECT_PLAN.md` §11).
  - `audit_events` append-only (RLS insert-only + trigger blocking update/delete). Ticket ID sequence `UAM-YYYY-NNNNNN`.
  - Seed: 26 apps / 4 categories (§4.2), equipment & physical access types, form v4.1 (incl. Country).
  - RLS policies per role for every table + pgTAP tests (approver cannot read drafts, etc.).
  - *Done when:* migrations apply cleanly from zero; RLS test suite green.

- [ ] **1.8 Vercel & environments**
  - Vercel project linked to GitHub; Preview per PR, Production on `main`; env vars per environment (Clerk dev/prod, Supabase dev/prod); domain from D12.
  - *Done when:* PR previews deploy and sign-in works on preview and production.

- [ ] **1.9 App shell**
  - `AppShell` + `TopBar` (role-based nav, avatar → profile, sign-out) + empty pages for Requests, Approvals, Reports, Audit log, Admin, Profile; empty states from the System states board.
  - *Done when:* navigation matches the design for both roles; Playwright smoke test for each role.

## Exit criteria
Signed-in app on production URL; both roles land correctly; schema + RLS tested; CI green on every PR.

## Session log
- (none yet)
