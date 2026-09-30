# Laine onboarding rights — project summary

> Read this first in every new session. It summarises everything decided so far; details live in the linked files.
> Last updated: 2026-09-30.

## What this is
An internal web app for Laine that replaces the PDF *Laine User Access Management Form v4* (onboarding, offboarding, access modification). It records requests, IT execution, signatures and approval, produces a PDF record, and has reports. It is a **system of record** — it does not provision access in external tools.

**Status:** planning ✅ · design in progress (most screens drafted) · **no application code yet**.

## Where things are

| File | Contents |
| --- | --- |
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | Full plan: scope, stack, form analysis + app catalog (§4), workflow (§5), AI (§6), extensibility (§7), signatures/PDF (§8), reports (§9), roles/security (§10), data model (§11), engineering practices (§12), phases (§13), acceptance criteria (§14), Context7-verified syntax (§15), risks (§16), **open decisions (§17)** |
| [design/README.md](design/README.md) | Design index + status of every screen |
| [design/tokens.md](design/tokens.md) | Colors, fonts, spacing, Tailwind v4 `@theme` + `next/font` setup |
| [design/components.md](design/components.md) | Reusable component inventory (build every screen from these) |
| `design/*.md` | One spec per screen (sign-in, request list, request form, review & sign, PDF export, approver view, reports) |
| [design/canvas/](design/canvas/) | Source of the visual design canvas (`.dc.html` artboards + `canvas.json`) |
| Design canvas (live, private) | https://claude.ai/artifact/Yb33RoTDGLAQphhBtU8wfD |

## People and roles
| Person | Role | Does |
| --- | --- | --- |
| **Raju Bholani** | Admin + requester + IT operator | Creates requests (manually or with the AI assistant), does the IT work, signs section 9 ("Review & sign"), manages users/catalog/fields. Main user. |
| **Moises Larez** | Approver / reviewer | **Only** approves (Confirm & sign, or Return to Raju), views reports, exports PDFs. Cannot create/edit requests. Own landing page "Approvals". |
| Backup approver (TBD) | Approver / reviewer | Same rights as Moises. |

Accounts are created by Raju; **no sign-up page** (Clerk sign-up mode = Restricted). Account help copy says "contact Raju".

## Workflow (decided)
Draft → In execution → (Raju: Review & sign) → Awaiting confirmation → (Moises: Confirm, sign & close **or** Return to Raju) → Closed → PDF generated.
- **No pre-provisioning approval.** Moises signs **once, at the end**. The form's "must not be provisioned before authorization" line is removed.
- **Never backdate.** All dates/timestamps are server-generated and not editable (user asked about backdating; declined for audit integrity).
- Nobody approves their own request.

## Stack (verified with Context7 on 2026-09-30 — re-verify when pinning versions)
Next.js 16 (App Router, TS) · Clerk Core 3 · Supabase (Postgres + Storage + RLS) · Vercel · Vercel AI SDK · Tailwind v4 · Zod · `@react-pdf/renderer` · (later) Resend, Microsoft Graph for SharePoint.

Gotchas already found — don't use outdated patterns:
- Next 16: `proxy.ts` (not `middleware.ts`).
- Clerk Core 3: `<Show when="signed-in">` (not `<SignedIn>`/`<SignedOut>`/`<Protect>`); `<ClerkProvider>` inside `<body>`; protect each page/route/server action with `auth.protect()` (`createRouteMatcher` deprecated); custom sign-in with `useSignIn()` → `signIn.password()` / `signIn.finalize()`; handle `needs_client_trust` (email code on new device).
- Clerk ↔ Supabase: native third-party auth, Supabase client `accessToken()` returns the Clerk token; RLS uses `auth.jwt() ->> 'sub'` (Clerk IDs are text, not UUID).
- AI SDK tools: `inputSchema` + `needsApproval`.
- SharePoint: Graph `PUT /sites/{id}/drive/items/{parent}:/{file}:/content` with `Sites.Selected` scoped to one site.

## Design decisions (all in `design/`)
- **Look:** laine.ai style. Colors `#F4F0EA` sand, `#000000` ink, `#7e7e7e` stone (on black only), `#cf2e2e` signal red (errors/attention only), `#535353` graphite for small text on sand. Fonts Raleway (body), Newsreader (headings), Instrument Serif italic (accent). Pill buttons. White Laine logo only on black.
- **App name:** "Laine onboarding rights".
- **Sign-in:** split screen, black brand panel + sign-in form; approved.
- **Raju lands on the Requests list** (people/requests table + **New request** + **Batch onboarding**).
- **Request form:** dense (small type), sections 1/2/4/5 open, **6–11 collapsed** until relevant, application access in **two columns** of the admin-managed catalog, AI suggestions shown with dashed outline + accept/reject.
- **AI assistant:** closed by default behind a **cute Laine robot** button (bottom-right, badge with pending suggestions); click opens the chat panel. Assistant can never approve/sign/submit/close.
- **"Review & sign"** is Raju's final button (confirmed) → dialog with checks, summary, signature preview, confirm checkbox.
- **Moises's view** is separate: Approvals · Records · Reports.
- **PDF export:** closed request page with **Download PDF** + **Save to SharePoint** (+ PDF marker in lists). Filename `firstname.lastname-onboarding.pdf`.
- **Reports:** left side panel of report types (All users, Onboarded by month/country/department, Signature log, Offboarding SLA, Access by application, Open requests), CSV/PDF export.
- **Extensibility:** apps, categories, equipment, form fields are **data** (admin-editable, versioned); adding a tool/field needs no code change. Only extra field agreed so far: **Country**.

## Design coverage (2026-09-30)
**Every planned screen has a first design** (31 boards on the canvas, specs in `design/`): sign-in (+ new-device code, reset password), requests list, request form + robot assistant, offboarding, returned, batch review, Review & sign, Moises's approvals / confirm & sign / read-only / records & PDF export, reports, My profile (signature upload), Admin (users & roles, applications, form fields, templates & defaults), audit log, generated PDF (2 A4 pages), system states, email notifications (phase 2). Access modification is specified in `design/request-variants.md` (same layout as offboarding).

Shared canvas components: `TopBar`, `BrandPanel`, `AdminNav` (imported with `<dc-import>`).

## Next steps
1. Raju reviews the new boards (most are "draft, awaiting review" in `design/README.md`) and answers the open decisions below.
2. Then **Phase 1 — Foundation** (PROJECT_PLAN §13): Next.js 16 app, Clerk, Supabase schema + RLS + tests, CI, Vercel environments, design tokens and the shared UI components.

## Open decisions (full list: PROJECT_PLAN §17)
Auth details (SSO? MFA), backup approver name, auditor sign-off on end-only approval, AI provider/model and data policy, data residency/retention, SharePoint option (download only / button / automatic) + site & folder + M365 admin, notifications, how admin role changes are controlled.

## Working agreements
- **Engineering, not vibe coding:** small PRs, CI (lint, typecheck, tests, RLS tests), migrations reviewed, server-side authorization everywhere.
- **Verify library syntax with Context7** before writing code; don't rely on memory.
- **Design canvas:** edit via the Artifact tool at the link above; keep `design/canvas/` in the repo in sync after changes. Artboards reference the logo as an uploaded canvas asset (`/_blob/17b23c9ce6dc5f048942c7b514470f03`); the file itself is `design/assets/laine-logo-white.png`.
- **Git:** repo https://github.com/rad-code05/ProjectOnBoarding (branch `main`). Push as **rad-code05** (personal account) — never `LaineNeuralNetwork`. This repo has a local credential helper using `gh auth token --user rad-code05`, and commit author name **Rad**. If a fresh clone can't push, re-apply:
  ```sh
  git config --local user.name "Rad"
  git config --local credential.helper ""
  git config --local --add credential.helper '!f() { test "$1" = get && echo username=rad-code05 && echo "password=$(gh auth token --user rad-code05)"; }; f'
  ```
