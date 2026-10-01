# Tech stack

The single reference for what we build with. Every phase uses this list; decisions and reasons are in `PROJECT_PLAN.md` §2–3.
Versions below are the **latest published on npm on 2026-09-30** — step **S1** pins exact versions in `package.json` (after a Context7 check), and after that the lockfile is the source of truth.

## Application

| Layer | Choice | Package(s) | Latest seen | Used from |
| --- | --- | --- | --- | --- |
| Framework | Next.js (App Router, Server Components, Server Actions, Route Handlers, `proxy.ts`) | `next`, `react`, `react-dom` | next 16.3.7 · react 19.3.0 | S1 |
| Language | TypeScript (strict) | `typescript` | 7.0.2 ⚠️ | S1 |
| Styling | Tailwind CSS v4 with `@theme` tokens + `next/font/google` (Raleway, Newsreader, Instrument Serif) | `tailwindcss`, `@tailwindcss/postcss` | 4.3.3 | S3 |
| Authentication | Clerk (Core 3) — custom sign-in, invitations, restricted sign-up, MFA | `@clerk/nextjs` | 7.9.8 | S5 |
| Database | Supabase Postgres + Row Level Security, Clerk as third-party auth | `@supabase/supabase-js`, `supabase` (CLI) | 2.117.2 · CLI 2.118.0 | S6 |
| File storage | Supabase Storage, private buckets (signatures, PDFs) | (same) | — | F05 |
| Validation | Zod (forms, Server Actions, AI tool inputs) | `zod` | 4.6.5 | S1 |
| PDF | React-PDF, server-side `renderToBuffer` | `@react-pdf/renderer` | 4.9.0 | F08 |
| Image processing | Re-encode uploaded PNGs, strip metadata | `sharp` | 0.35.5 | F05 |
| AI chat | Vercel AI SDK (`streamText`, `tool` + `needsApproval`, `useChat`) | `ai`, `@ai-sdk/react` | 7.0.123 · 4.0.126 | F15 |
| AI model | **Pending D7.** Default proposal: Anthropic Claude (`claude-sonnet-5-5`), set by env var | `@ai-sdk/anthropic` (or OpenRouter provider) | 4.0.69 | F15 |
| Batch files | CSV / XLSX parsing (server-side) — **pending D8** | `papaparse`, `exceljs` | 5.7.0 · 4.4.0 | F17 |
| Charts | Plain SVG/HTML bars (single series) — no chart library needed | — | — | F12 |
| Email (phase 7) | Resend | `resend` | 6.31.0 | F23 |
| SharePoint (phase 7) | Microsoft Graph via server `fetch` (`Sites.Selected`) — client library optional | `@microsoft/microsoft-graph-client` (optional) | 3.0.7 | F22 |
| Error monitoring | Sentry with personal-data scrubbing (to confirm in 6.3) | `@sentry/nextjs` | 11.1.0 | R3 |

**Pinned in S1 (2026-10-01):** next 16.3.8 · react 19.2.8 · typescript 5.9.3 · tailwindcss 4.3.3 · eslint 9.39.5 · vitest 5.0.2 · prettier 3.9.9 · pnpm 12.8.1 — the lockfile is now the source of truth.

⚠️ **TypeScript 7** is the new native compiler (resolved in S1: `create-next-app` installs 5.9.x, so we pinned 5.9.3). Step S1 must check which TypeScript version the pinned Next.js, ESLint and typescript-eslint support, and pin that (possibly the latest 6.x line) rather than blindly taking 7.x.

## Quality & testing

| Purpose | Tool | Latest seen |
| --- | --- | --- |
| Linting | ESLint (flat config, `eslint-config-next`) | 10.11.0 |
| Formatting | Prettier (+ Tailwind class sorting plugin) | 3.9.9 |
| Unit / component tests | Vitest + Testing Library (+ `user-event` 14.6.7 for keyboard/mouse, `jest-dom` 7.0.1 for DOM matchers) | 5.0.2 · 16.3.3 |
| End-to-end tests | Playwright | 1.63.0 |
| Database / RLS tests | pgTAP via `supabase test db` | (CLI) |
| CI | GitHub Actions (lint, format, typecheck, tests, build, secret scan, dependency audit) | — |
| Dependency updates | Dependabot or Renovate (weekly, grouped) | — |

## Services & accounts

| Service | Environments | Owner / billing | Needed from |
| --- | --- | --- | --- |
| GitHub `rad-code05/ProjectOnBoarding` | — | Rad (personal) | now |
| Vercel (hosting) | Preview per PR, Production | **D12** | 1.8 |
| Clerk | Development instance, Production instance | **D12** | S5 |
| Supabase | `dev` project, `prod` project, region **D2** | **D12** | S6 |
| AI provider (Anthropic or OpenRouter) | one key per environment | **D7** | F15 |
| Resend | — | D10 | F23 |
| Microsoft 365 / Entra (app registration) | — | D9 | F22 |
| Sentry (or alternative) | — | to confirm | R3 |
| Domain (e.g. `access.laine.ai`) | Production | **D12** | 1.8 |

## Developer machine (checked 2026-09-30 on Raju's PC)

| Tool | Needed | Status on this PC |
| --- | --- | --- |
| Node.js | Current **Active LTS (Node 24)**, pinned in `.nvmrc` | v22.12.0 installed → **upgrade to 24 LTS** |
| pnpm | Package manager (via Corepack or standalone) | **not installed** |
| Docker Desktop | Runs local Supabase (`supabase start`) and local pgTAP tests | **not installed** — install, or use the cloud `dev` project only |
| Supabase CLI | Migrations, local stack, tests | install as dev dependency (`supabase`) |
| GitHub CLI | PRs, auth for `rad-code05` | 2.97.0 ✓ |
| Git | — | 2.45.2 ✓ |
| VS Code + Claude Code | Editor | ✓ |

## Environment variables (names only; values live in Vercel / `.env.local`, never in git)

| Variable | Where | Phase |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` | all envs | 1.4, 1.6 |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | all envs | S6 |
| `SUPABASE_SECRET_KEY` (service role — scripts/migrations only, never in request code) | CI / local scripts | S6 |
| `AI_PROVIDER`, `AI_MODEL`, `ANTHROPIC_API_KEY` (or `OPENROUTER_API_KEY`) | server | F15 |
| `RESEND_API_KEY` | server | F23 |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `SHAREPOINT_SITE_ID`, `SHAREPOINT_FOLDER_ID` | server | F22 |
| `SENTRY_DSN` | all envs | R3 |

## Deliberately not used

| Not using | Because |
| --- | --- |
| Supabase client in the browser | All data access goes through the server (with the Clerk token, so RLS still applies) |
| An ORM (Prisma, Drizzle) | Supabase SQL migrations + RLS are the source of truth; typed client via `supabase gen types` |
| Headless Chrome for PDFs | Too heavy for Vercel functions; React-PDF renders directly |
| An e-signature provider | D13: signatures are an internal record, not legally binding |
| Edge runtime | `proxy.ts` runs on Node.js in Next 16; keep everything on Node.js |
| Outdated APIs | `middleware.ts`, `<SignedIn>/<SignedOut>`, `createRouteMatcher`, Clerk JWT templates, `auth.uid()` for Clerk users — see `CLAUDE.md` gotchas |

## Version policy
- Pin exact versions; commit the lockfile; upgrade through PRs only.
- Before any upgrade or new integration, re-check the API in Context7 (IDs in `PROJECT_PLAN.md` §15).
- Major upgrades (Next, Clerk, AI SDK, TypeScript) get their own PR with the tests passing.
