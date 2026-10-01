# Laine User Access Management — Project Plan

| | |
| --- | --- |
| **Status** | Discovery / planning — not implementation-ready until Section 17 decisions are confirmed |
| **Source form** | *Laine User Access Management Form* v4 (Onboarding / Offboarding / Access Modification) |
| **Last updated** | 2026-09-30 (roles, Country field, editable catalog) |
| **Docs verified with** | Context7 (see Section 15) |

---

## 1. Purpose and Scope

Build a secure internal web application that replaces the static PDF form with a traceable workflow for **onboarding, offboarding, and access modification**. It supports manual entry and AI-assisted entry (single person or batch), approvals, IT execution tracking, sign-off, reporting, and export of a completed PDF record.

**In scope (v1):** request lifecycle, versioned form, application/equipment catalog, approvals, IT execution record, signatures, PDF export, reports, audit log, AI chat side panel.

**Out of scope (v1):** automatically granting or revoking access in external systems (Google Workspace, GitHub, Slack, etc.). The app is the **system of record and approval**, not a provisioning engine. Automated provisioning can be evaluated later per system.

---

## 2. Stack Decision

| Layer | Choice | Why / notes |
| --- | --- | --- |
| Framework | **Next.js 16 (App Router) + TypeScript** | Full-stack in one repo; Server Components, Server Actions, Route Handlers. Pin exact version at Foundation. |
| Auth | **Clerk (Core 3)** | Prebuilt sign-in/out UI, SSO with Google Workspace / Microsoft 365 (both are in Laine's app list), MFA, invitation-only sign-up. Native Supabase integration. |
| Database | **Supabase Postgres** | Relational data fits reporting; Row Level Security (RLS) as a second line of defence. Laine already uses Supabase. |
| File storage | **Supabase Storage** (private buckets) | Signature PNGs and generated PDFs, protected by Storage RLS policies. |
| Hosting | **Vercel** | Preview deployment per pull request; separate production environment. |
| AI chat | **Vercel AI SDK** (`ai`, `@ai-sdk/react`) | Provider-neutral; streaming chat; tool calling with built-in **human approval** (`needsApproval`). |
| AI model | **To decide** — recommended default: Anthropic Claude (`claude-sonnet-5-5`) via `@ai-sdk/anthropic`, or via OpenRouter (already used at Laine) | Model is an environment setting, not hard-coded. Decision depends on data-processing terms (Section 10). |
| AI tracing | LangFuse (already used at Laine) — optional | Only with personal-data redaction. |
| Styling | Tailwind CSS v4 (`@theme` tokens) + `next/font/google` (Raleway, Newsreader, Instrument Serif) | Tokens and components defined in [design/](design/README.md). |
| Validation | Zod | One schema shared by forms, Server Actions, and AI tool inputs. |
| PDF | `@react-pdf/renderer` (`renderToBuffer`) in a Node.js Route Handler | No headless browser, so it works within Vercel serverless limits. |
| Email notifications | Resend (already used at Laine) — phase 2 | Approval requests, SLA reminders. |
| Tests | Vitest (unit), Playwright (end-to-end), pgTAP via Supabase CLI (RLS policies) | Versions to verify at Foundation. |

**Assessment:** the proposed stack is a good fit — keep it. The one real alternative is **Supabase Auth instead of Clerk** (one vendor fewer, simpler RLS using `auth.uid()`). Clerk is still recommended because of its SSO/admin UX and because the Supabase integration is now first-class. Decide this before Foundation; it is the only stack choice that is expensive to reverse.

---

## 3. Architecture

```
Browser (React)                       Vercel (Next.js 16, Node.js runtime)                 Supabase
─────────────────                     ────────────────────────────────────                 ────────
Form UI  ───────── Server Actions ──▶ auth.protect() + role check + Zod ──(Clerk JWT)──▶ Postgres + RLS
Chat panel ─────── /api/chat ──────▶ AI SDK streamText + tools ──────▶ AI provider
PDF button ─────── /api/pdf/[id] ──▶ react-pdf renderToBuffer ───────(Clerk JWT)──▶ Storage (private)
                   proxy.ts ─────────▶ clerkMiddleware() (session only)
```

**Access-control pattern (decision proposed):**

1. **All data access goes through the server** (Server Components, Server Actions, Route Handlers). The browser never queries Supabase directly.
2. Every server entry point calls `auth.protect()` and checks the user's **application role** before acting (Clerk's current guidance is per-resource protection, not route matchers in middleware).
3. The server's Supabase client passes the **Clerk session token** (`accessToken` callback), so **RLS is enforced as defence in depth** — a bug in app code cannot read another scope's data.
4. The Supabase **service-role / secret key is never used in request paths** — only for migrations and admin scripts. It must never be in a `NEXT_PUBLIC_` variable.
5. Application roles are stored in the **Supabase `user_roles` table**, keyed by Clerk user ID (queryable for reports and usable in RLS). Clerk handles *who you are*; the database handles *what you may do*.
6. Clerk user IDs are strings (`user_…`), not UUIDs: all user-reference columns are `text`, and RLS uses `auth.jwt() ->> 'sub'`, never `auth.uid()`.

---

## 4. Source Form Analysis (v4)

### 4.1 Sections and fields

| # | Section | Fields and options (from the form) | App notes |
| --- | --- | --- | --- |
| 1 | Ticket Information | Ticket Type: Onboarding / Offboarding / Access Modification · Ticket ID (auto-generated) · Status: Open / In Progress / Closed · Priority: Low / Medium / High · Assignee (IT Owner) · Opened date · Closed date | Ticket ID from a database sequence, e.g. `UAM-2026-000123`. Status derived from workflow state (4.3). Dates are server timestamps. |
| 2 | User / Employee Details | Employee Name · Job Title / Role · Department / Team · Manager / Requestor · Employment Event: Start / Termination / Role Change · Effective Date | Employment Event is implied by Ticket Type (Onboarding→Start, Offboarding→Termination, Access Modification→Role Change); derive it, don't ask twice. Split name into first/last (needed for the PDF filename). |
| 3 | Access Authorization (Pre-Provisioning) | Approver Name · Approver Role / Title · Decision: Approved / Rejected · Approval Date · Approver Comments | **Changed (decision 2026-09-30):** there is no pre-provisioning approval step. This becomes **Final Authorization & Confirmation**, completed by Moises at the end (see 4.3, 5.1). The line *"Access must not be provisioned or modified until this section is completed"* is removed from the app and PDF so the record does not claim a control that isn't performed. Approver is the signed-in user; the date is the real server timestamp — never backdated or editable. |
| 4 | Access Provisioning Method | RBAC template applied **or** Custom / Exception · Role Template Name · RBAC Document Link (read-only) | *"Only list systems below if access deviates from the approved RBAC."* See 4.4. |
| 5 | Application Access Matrix | Per app: Action · Authorized Role / Permission · Notes — 4 categories, 26 apps (4.2) | Catalog-driven rows, not fixed columns. |
| 6 | IT Equipment Management | Laptop (Windows / macOS), Mobile Phone, Other · Action: Issue / Return · Asset Tag / Serial No. · Notes | Multiple items allowed; "Other" needs a description. |
| 7 | Physical & Logical Access | Office Access (Grant / Disable, scope Badge / Key) · VPN / Secure Access (Grant / Disable, scope Corporate VPN) · Shared Drives (Grant / Modify / Remove, scope Dept / Project) · Notes | Same catalog mechanism as Section 5. |
| 8 | Access Removal SLA (mandatory for offboarding) | Expected timeline: Immediate (same day) / Within 24h / Within 48h · Removed within SLA: Yes / No · Reason if missed | SLA deadline computed from effective date/time; "within SLA" computed from execution timestamp; reason required if missed. |
| 9 | IT Execution Confirmation | Checklist: all authorized access provisioned/modified · all access removed per offboarding · devices enrolled or recovered · security controls applied (MFA, MDM, EDR) · Implementation Notes · Executed By · Execution Date | Checklist items shown per ticket type. Executed By = signed-in IT operator. |
| 10 | Final Review & Closure | Final Reviewer · Review Date · Confirmed Complete | Closure requires execution complete + checklist + signatures. |
| 11 | Signatures & Sign-Off | Authorizing Approver signature + date · IT Execution Owner signature + date | See Section 8. |

**Pre-filled names on the current form** — Assignee: Raju Bholani; Approver and Final Reviewer: Moises Larez. In the app these become **configurable defaults** (admin setting), not hard-coded values. Confirmed responsibilities are in Section 10.1.

### 4.2 Initial application catalog (seed data)

| Category | Application | Actions | Permission options |
| --- | --- | --- | --- |
| Core Business | Office 365 | Grant / Modify / Remove | User, Admin |
| Core Business | Google Workspace | Grant / Modify / Remove | User, Admin |
| Core Business | Slack | Grant / Modify / Remove | Member, Admin |
| Core Business | GitHub | Grant / Modify / Remove | Read, Write, Admin |
| Core Business | Monday.com | Grant / Modify / Remove | User, Admin |
| Core Business | Trello | Grant / Modify / Remove | Member, Admin |
| Core Business | Siteground | Grant / Modify / Remove | Member, Admin |
| Core Business | Figma | Grant / Modify / Remove | Viewer, Editor, Admin |
| Engineering, Cloud & Data | Google Cloud | Grant / Modify / Remove | Viewer, Editor, Admin |
| Engineering, Cloud & Data | Firebase | Grant / Modify / Remove | Viewer, Editor, Admin |
| Engineering, Cloud & Data | Supabase | Grant / Modify / Remove | Read, Write, Admin |
| Engineering, Cloud & Data | MongoDB | Grant / Modify / Remove | Read, Write, Admin |
| Engineering, Cloud & Data | LangFuse | Grant / Modify / Remove | Read, Write, Admin |
| Engineering, Cloud & Data | OpenRouter | Grant / Modify / Remove | Read, Write, Admin |
| Engineering, Cloud & Data | Cloudflare | Grant / Modify / Remove | DNS, Security, Admin |
| Security, Device & Identity | Hexnode (MDM) | **Enroll / Remove** | Device, Admin |
| Security, Device & Identity | Sophos Central | Grant / Modify / Remove | User, Admin |
| Security, Device & Identity | Vouch | Grant / Modify / Remove | User, Admin |
| Security, Device & Identity | SecureFrame | Grant / Modify / Remove | User, Admin |
| Business, Finance & Ops | Payrexx | Grant / Modify / Remove | Finance, Admin |
| Business, Finance & Ops | Deel | Grant / Modify / Remove | User, Admin |
| Business, Finance & Ops | Mixpanel | Grant / Modify / Remove | Viewer, Analyst, Admin |
| Business, Finance & Ops | Locize | Grant / Modify / Remove | User, Admin |
| Business, Finance & Ops | resend.com | Grant / Modify / Remove | API, Admin |
| Business, Finance & Ops | Clay | Grant / Modify / Remove | User, Admin |
| Business, Finance & Ops | HubSpot | Grant / Modify / Remove | User, Admin |

Catalog rules: each app has its **own action set** (Hexnode differs) and **own permission options**; apps can be added, renamed, or retired (retired apps stay on historical records); custom one-off apps are allowed on a request as "Other".

### 4.3 Workflow states → form Status

| Internal state | Meaning | Form "Status" on PDF |
| --- | --- | --- |
| `draft` | Being filled in (manually or by AI) | Open |
| `in_execution` | Raju setting up / removing access and recording actions | In Progress |
| `pending_confirmation` | Raju confirmed execution and signed Section 9; waiting for Moises | In Progress |
| `returned` | Moises sent it back with a comment. Raju's signature is cleared (kept in audit); sections 1–9 unlock; Raju edits, then **must sign again** via Review & sign → `pending_confirmation` | In Progress |
| `closed` | Moises confirmed, approved, and signed; PDF generated | Closed |
| `cancelled` | Withdrawn (reason required) | Closed |

`draft` → `in_execution` can happen immediately; there is no approval gate before provisioning.

Transitions are enforced in the database (a transition function + check), not only in the UI. Each transition writes an audit event.

### 4.4 Gaps and improvements found in the form

1. **RBAC templates are only a name + link.** Proposal: store role templates as data (template → list of app/permission rows). Choosing a template pre-fills the matrix; the matrix then shows only deviations, as the form intends, while the record still contains the full list of what was granted.
2. **Offboarding has no list of what to remove.** Proposal: keep a per-employee **access inventory** built from closed requests; an offboarding request pre-fills every app/equipment item the person currently holds, so nothing is forgotten.
3. **Ticket Type and Employment Event duplicate each other** — derive one from the other.
4. **Single "Employee Name"** — split into first/last (and optional preferred name) for the filename and search.
5. **Manager and Requestor are one field** — often different people; split them.
6. **No employee identifier** — add work email as the stable key (names are not unique).
7. **"Access removed within SLA" is self-reported** — compute it from timestamps.
8. **Approver and final reviewer were separate steps** — resolved: merged into one final confirmation by Moises (Section 5.1).
9. **No record of the signer's identity beyond a name** — the app records the authenticated user who signed.

### 4.5 Additional fields

**Agreed for v1 (2026-09-30):** **Country** (all ticket types, required, selected from a list). First name / Last name remain split internally so the PDF filename can be built. All other fields below are **deferred** — candidates to add later through the admin field catalog (Section 7) without code changes.

| Field | Applies to | Proposed required? | Reason |
| --- | --- | --- | --- |
| **Country** ✅ agreed | All | Yes | Reporting, SLA timezone, equipment shipping |
| First name / Last name | All | Yes | PDF filename, sorting, search |
| Preferred name | All | No | Display |
| Work email | All | Yes | Stable employee identity; links onboarding ↔ offboarding |
| Personal email | Onboarding | No (sensitive) | Sending first-day invites |
| Employment type (Employee / Contractor / Intern) | All | Yes | Reporting; contractors often have end dates |
| Manager (separate from Requestor) | All | Yes | Approval routing |
| Location / Country / Timezone | All | Yes | SLA calculation, equipment shipping, reporting |
| Contract end date | Contractors | Conditional | Triggers offboarding reminder |
| Last working day | Offboarding | Yes | Differs from access-removal effective date |
| Account action: Suspend / Delete + deletion date | Offboarding | Yes | Data retention |
| Data / mailbox handover owner | Offboarding | Yes | Ownership transfer for Drive, GitHub repos, etc. |
| Licence reclaimed (per app) | Offboarding | No | Cost tracking |
| Equipment return due date / received date | Offboarding | Conditional | Return tracking |
| GitHub username / external usernames | Engineering apps | No | Accurate provisioning |

---

## 5. User Workflows

### 5.1 Onboarding / access modification
1. Raju signs in (Clerk) → **Main page**: request list + "New request".
2. Raju fills the form **manually** or via the **AI chat side panel** (the main expected usage). Saved as `draft`.
3. Raju starts work → `in_execution`; records app/equipment/physical-access actions, checklist, and notes as they are done.
4. Raju reviews the confirmation summary → **signs Section 9** → `pending_confirmation`; Moises is notified (phase 2: email via Resend).
5. Moises reviews everything Raju signed and either **confirms, approves, and signs** (Sections 3 + 10 + 11) → `closed` → PDF generated and stored, or **returns** it with comments → Raju corrects and re-signs.

**Decision (2026-09-30):** Moises signs **once, at the end, as confirmation**. There is no approval before access is set up.

> **Compliance note:** this is a *post-provisioning review* control, not a *pre-provisioning authorization* control. If Laine is audited (e.g. SOC 2 / ISO 27001 evidence via SecureFrame or Vouch), check with the auditor that end-of-process confirmation is acceptable. The app records the true order of events either way, and can add an optional pre-approval step later as a setting if needed — it will never backdate dates.

### 5.2 Offboarding
Same flow, plus: SLA timeline required at creation; access inventory pre-fills removals; SLA countdown shown on the request and dashboard; missed-SLA reason required before closure.

### 5.3 Screen map (v1)
| Screen | Purpose |
| --- | --- |
| Sign-in / sign-out | Clerk components; invitation-only |
| Dashboard / request list | Filter by type, status, assignee, priority, department, date; SLA warnings |
| Request detail / form | Sectioned form mirroring the PDF; chat side panel on the right; audit timeline tab |
| Batch review | Grid of AI-proposed people/rows with per-row validation and per-row accept |
| Reports | Section 9 |
| Audit log | Filterable, read-only |
| Admin | Users & roles, app catalog, RBAC templates, form fields & versions, field suggestions, defaults |
| My profile | Upload / replace own signature or initials PNG |

---

## 6. AI Chat Side Panel

### 6.1 What it does
- Collects details conversationally and **proposes values for form fields**; proposals appear highlighted in the form ("AI-suggested") and the user accepts, edits, or discards each.
- **Batch onboarding:** user pastes a list or uploads a CSV/XLSX; the assistant proposes one draft per person into the **batch review grid**, flagging missing, invalid, or conflicting values (e.g. duplicate work email, unknown department, effective date in the past).
- **Field suggestions:** "we also need a field for X" → creates a *field suggestion* for an admin to review (Section 7). It never changes the live form.
- Answers questions about the current request (e.g. "what's still missing?").

### 6.2 What it must never do
Approve or reject, sign, submit, close, cancel, change roles, publish form changes, or provision/revoke access. These operations are **not exposed as tools at all** — enforced by construction, not by prompt.

### 6.3 Tool design
| Tool | Effect | Approval |
| --- | --- | --- |
| `proposeFieldValues` | Returns proposed values; UI applies to unsaved form state | User accepts per field in the form |
| `proposeBatchRows` | Returns rows for the batch grid | User accepts per row |
| `createDraftRequests` | Persists accepted batch rows as `draft` requests | `needsApproval: true` (AI SDK human-in-the-loop) |
| `suggestFormField` | Creates a field suggestion record | `needsApproval: true` |
| `getRequestSummary` / `getCatalog` | Read-only lookups, scoped to the user's permissions | None |

All tool inputs are validated with Zod on the server; every server-side tool re-checks the user's role. Accepted AI values are recorded in the audit log with `source = ai`.

### 6.4 Safety and data protection
- Treat uploaded files and pasted text as **untrusted data** (prompt-injection risk); the tool boundary above limits the damage.
- Send only the fields needed; never send signature images, credentials, or secrets to the model.
- Rate-limit `/api/chat` per user and set a monthly spend cap.
- Choose the provider only after confirming data-processing terms, retention (prefer zero-retention), and region (Section 17).

---

## 7. Form Extensibility

- **Field catalog:** admin-defined fields with label, key, type (text, date, select, multi-select, boolean, email, user reference), validation, required flag, help text, applicable ticket types, section, display order, and "reportable / exportable" flags.
- **Versioned schemas:** publishing creates a new immutable form version. Each request stores the version it was created under; historical requests and PDFs never change.
- **Extra field values** are stored as validated JSON (`custom_fields jsonb`) against the version's schema; core fields (names, dates, type, status) are real columns for reliable reporting.
- **Chat-requested fields** become *suggestions* (proposer, reason, proposed definition) that an admin edits, approves, and publishes.
- The **app catalog** and **RBAC templates** are managed separately from form fields.

**Changing the tech stack in the form is a core requirement** — Laine's tools will change over time. The application list (Section 4.2) is **data, not code**:
- Raju (admin) can, from the Admin screen and **without a code change or deployment**: add an application, rename it, move it to another category, change its allowed actions (e.g. Grant/Modify/Remove vs. Enroll/Remove) and permission options, reorder it, and add/rename categories.
- Removing a tool **retires** it (hidden from new requests) rather than deleting it, so past requests, PDFs, and the access inventory still show it correctly.
- Every catalog change is audit-logged and applies to new requests only; each request keeps a snapshot of the catalog entries it used.
- The same applies to equipment types (Section 6) and physical/logical access types (Section 7).
- Raju can also ask the AI chat ("add Notion under Core Business with Member/Admin"); it creates a catalog **suggestion** that Raju confirms with one click before it goes live.

---

## 8. Signatures, Confirmation, and PDF

### 8.1 Signing flow (as requested)
1. Each signer uploads their own **signature or initials PNG** once in *My profile* (can replace it; old versions kept for historical records).
2. When Raju (IT owner, Section 9) finishes, and again when Moises (final confirmation) finishes, a **confirmation dialog** shows a read-only summary of everything being signed.
3. On "Confirm and sign", the server attaches the signer's current signature image with a **server-generated timestamp**, and records: signer's user ID, role, request ID, form version, and a SHA-256 hash of the request snapshot.
4. Once signed, the signed sections are locked; any later change clears the signature and requires re-approval (rule to confirm in Section 17).

Rules: only the signed-in user can apply their own signature; the AI can never sign. Uploads are PNG only, size- and dimension-limited, re-encoded server-side to strip metadata, and stored in a private bucket. The image is a visual mark; the proof is the authenticated audit record. **Decided (D13):** this is an internal acknowledgment, not a legally binding e-signature — no e-signature provider. Initials may also be typed (rendered in Instrument Serif italic) instead of uploaded.

### 8.2 PDF export
- Generated server-side with `@react-pdf/renderer`, laid out to mirror the v4 form (same 11 sections), from a **frozen snapshot** of the request at closure, so it can be regenerated identically.
- Filename: `firstname.lastname-onboarding.pdf`; proposed `firstname.lastname-offboarding.pdf` and `firstname.lastname-access-modification.pdf`.
- Filename sanitising: lowercase, accents transliterated (`José Müller` → `jose.muller`), spaces/hyphens in multi-part names kept as `-`, other characters removed. Storage path includes the ticket ID so names never collide: `pdfs/UAM-2026-000123/jose.muller-onboarding.pdf`. The download keeps the plain filename.
- Draft/unsigned PDFs (if allowed) are watermarked "DRAFT – NOT APPROVED".
- Every download/export is an audit event.
- **Export destinations** (design: `design/pdf-export.md`): **Download PDF** to the computer (v1). **Save to SharePoint** via Microsoft Graph with an Entra app registration limited by `Sites.Selected` to one site/library (proposed v1.1; needs a Microsoft 365 admin). Decision open in Section 17.

---

## 9. Reporting

### 9.1 Date fields (stored separately, server-generated where applicable)
`created_at`, `effective_date`, `execution_started_at`, `execution_completed_at` (Raju signs), `confirmed_at` (Moises signs), `closed_at`, `sla_due_at`.

### 9.2 Metric definitions (proposed — confirm in Section 17)
- **"Onboarded this month"** = onboarding requests with `execution_completed_at` in the calendar month (company timezone). "Created this month" and "Closed this month" are available as separate views.
- **SLA met** = `execution_completed_at ≤ sla_due_at`.

### 9.3 Initial reports
1. Monthly counts: created / submitted / approved / completed / closed, by ticket type.
2. People onboarded in a period: name, work email, job title, department, manager, effective date, completion date, assignee — role-restricted.
3. Open requests by status, assignee, priority, age.
4. Offboarding SLA performance: met / missed, missed reasons.
5. Access by application (who currently holds what, from the access inventory) — useful for audits (SecureFrame/Vouch evidence).
6. CSV export of any filtered report — permission-checked and audited.

---

## 10. Roles, Security, and Compliance

### 10.1 Roles (proposed)
| Role | Can |
| --- | --- |
| Requester | Create requests, edit own drafts, view own requests |
| Approver / Reviewer | **Approve, view reports, export PDFs — nothing else.** Sees only requests that are Awaiting confirmation, Returned or Closed (read-only); confirm & sign, or return with comments; closes the request; downloads PDFs / saves to SharePoint; read-only reports. Cannot create or edit requests or use the assistant. Separate landing page (*Approvals*) — see `design/approver-view.md`. |
| IT operator | Record execution; sign Section 9 |
| Administrator | Users/roles, catalogs, RBAC templates, form versions, defaults |
| Auditor (read-only) | View all records, reports, audit log |

Users can hold multiple roles.

**Confirmed assignment (2026-09-30):**

| Person | Roles | Responsibilities |
| --- | --- | --- |
| Raju Bholani | Administrator, Requester, IT operator | Full admin (users, catalog, fields, templates); main user of the AI chat and manual entry; signs as preparer and as IT execution owner (Section 9) |
| Moises Larez | Approver / Reviewer | Signs once at the end: confirms and approves what Raju has done and signed, then the request closes (Sections 3, 10, 11) |
| Additional account (to be created; person TBD) | Approver / Reviewer | Backup approver with the same rights as Moises — covers absences so requests aren't blocked |

**Segregation-of-duties rules (enforced server-side):**
- A user can never approve or close a request they prepared or executed — so Raju's admin rights do not let Raju approve Raju's own requests.
- An admin cannot grant themselves the Approver or Reviewer role on their own; role changes require a second admin or are at minimum flagged in the audit log and visible to Moises. *(Choose one in Section 17.)*
- **Approver is a role, not a person.** Any account with the Approver / Reviewer role can confirm a request; the PDF and audit log record which approver actually signed. Raju (admin) assigns the role from the Admin → Users screen when the additional account is created (Clerk invitation → role assigned in `user_roles`).
- **Pending confirmations go to all approvers** (queue visible to every approver; phase 2: notification to each). The first approver to confirm closes it; the others see it as done.
- The *default approver* setting (Section 4.1) can name Moises as primary while still allowing any approver to sign.

### 10.2 Controls
- **Sign-in:** invitation-only or company-domain restriction in Clerk; SSO with Google Workspace or Microsoft 365; MFA required.
- **Log-off:** Clerk `<UserButton />` sign-out ends the session; idle session timeout configured in Clerk.
- **Log feature — two separate logs:**
  1. **Audit log** (in the app, append-only): sign-in/out, create, edit (field-level before/after), submit, approve/reject, execution updates, sign, export, close, role and catalog changes. Stores actor, timestamp, action, record reference, source (user/AI). No secrets or signature images.
  2. **Operational logs** (Vercel): errors and performance, with personal data scrubbed.
- **Append-only audit table:** RLS allows insert only; no update/delete for any application role; a trigger blocks changes.
- **Concurrency:** each request carries a `version`; saves with a stale version are rejected (no silent overwrites).
- **Secrets** only in Vercel/Supabase environment settings; never in the repo; secret scanning in CI.
- **Data residency, retention, backup:** choose the Supabase region per data-residency requirements; define retention for records, signatures, PDFs; enable backups/point-in-time recovery and test a restore before go-live.

---

## 11. Data Model (initial)

| Table | Purpose / key columns |
| --- | --- |
| `app_users` | `clerk_user_id text pk`, name, email, active |
| `user_roles` | `clerk_user_id`, `role` |
| `employees` | id, first/last/preferred name, work email (unique), department, job title, manager, location, employment type |
| `requests` | id, `ticket_id` (sequence), type, state, priority, assignee, requester, employee_id, effective_date, SLA fields, provisioning method, rbac_template_id, form_version_id, `custom_fields jsonb`, all date columns, `version` |
| `request_access_items` | request_id, catalog_app_id or custom name, action, permission, notes, executed_at, executed_by |
| `request_equipment_items` | request_id, type, action, asset tag/serial, notes |
| `request_physical_access_items` | request_id, access type, action, scope, notes |
| `approvals` | request_id, approver, decision, comments, decided_at |
| `execution_confirmations` | request_id, checklist items, notes, executed_by, executed_at |
| `signatures` | request_id, section, signer, role, signature_asset_id, form_version_id, snapshot_id, signed_at (server), cleared_at (set when a returned request clears it) |
| `request_snapshots` | id, request_id, kind (`it_signature` · `approval` · `closure`), data `jsonb` (full request incl. items, canonicalised with RFC 8785 JSON Canonicalization before hashing), sha256, created_at — immutable |
| `signature_assets` | owner, storage path, uploaded_at, active |
| `catalog_categories`, `catalog_apps` | name, actions allowed, permission options, active, order |
| `rbac_templates`, `rbac_template_items` | template name, document link, app/permission rows |
| `form_versions`, `form_fields` | versioned schema definitions |
| `field_suggestions` | proposed definition, proposer, status, admin notes |
| `employee_access_inventory` | employee, app, permission, granted/removed by request |
| `pdf_documents` | request_id, snapshot_id (the `closure` snapshot), storage path, filename, pdf sha256, generated_at |
| `audit_events` | actor, action, entity, entity_id, diff (sanitised), source, created_at — append-only |
| `settings` | default assignee/approver/reviewer, company timezone, SLA definitions |

All schema changes are versioned SQL migrations (Supabase CLI) reviewed in pull requests.

---

## 12. Engineering Practices

- **Repository:** GitHub, `main` protected; changes only via pull request with at least one review and passing CI.
- **Branches / commits:** short-lived feature branches; Conventional Commits (`feat:`, `fix:`, `chore:`…).
- **CI (GitHub Actions) on every PR:** install with lockfile → lint (ESLint) → format check (Prettier) → typecheck (`tsc --noEmit`) → unit tests (Vitest) → RLS/database tests (Supabase local + pgTAP) → end-to-end tests (Playwright) on the Vercel preview → dependency audit → secret scan.
- **Environments:** local (Supabase CLI + Clerk dev instance) → Preview (per PR) → Production. Separate Supabase projects and Clerk instances for non-prod and prod.
- **Decisions:** architecture decisions recorded as short ADRs in `docs/adr/`.
- **Definition of Done:** acceptance criteria met, tests added, authorization checked server-side, audit events written, migration reviewed, docs updated, accessible (keyboard + WCAG 2.1 AA target).
- **Tooling pins:** Node.js LTS version and package manager (pnpm recommended) pinned in the repo; exact dependency versions via lockfile.

Proposed repository layout:
```
/app                 Next.js routes (App Router)
  /(app)/requests    list, new, [id]
  /(app)/reports
  /(app)/admin
  /api/chat          AI route handler
  /api/pdf/[id]      PDF route handler
/components          UI components (form sections, chat panel)
/lib                 supabase client, auth/roles, zod schemas, pdf, ai tools
/supabase            migrations, seed (catalog from 4.2), tests (pgTAP)
/tests               vitest + playwright
/docs                ADRs, runbooks
proxy.ts             clerkMiddleware()
```

---

## 13. Delivery Plan

> The detailed, step-by-step version of this section lives in [plan/](plan/README.md) (walking skeleton S1–S7, features F01–F23, release). Keep this table as the overview.

| Phase | Deliverables | Exit criteria |
| --- | --- | --- |
| **0. Discovery** | Answers to Section 17; agreed field list; role matrix; report definitions; wireframes | Plan signed off by owner |
| **1. Foundation** | GitHub repo, CI, Next.js + Clerk + Supabase wired, environments, base schema, roles + RLS, seed catalog, audit table | Sign-in/out works; RLS tests pass; preview deploys on PR |
| **2. Core workflow** | Request list/detail, form sections 1–10, drafts, submit, approve/reject, execution, review/close, state machine | Full manual onboarding + offboarding end-to-end in Preview |
| **3. Records** | Signatures + confirmation dialog, PDF export, audit log view, reports + CSV export | Closed request produces correct PDF and audit trail |
| **4. AI assistance** | Chat panel, field proposals, batch review grid, field suggestions | AI cannot perform forbidden actions (tested); batch of 10 reviewed and saved |
| **5. Admin & extensibility** | Catalog admin, RBAC templates, form versioning, access inventory | New field published without affecting old requests |
| **6. Hardening & release** | Security review, accessibility pass, backup/restore test, runbook, production launch | Go-live checklist complete |
| Phase 2 (later) | Email/Slack notifications, SLA reminders, contractor end-date reminders, optional automated provisioning | — |

---

## 14. Acceptance Criteria (v1)

- Only invited users can sign in; sign-out ends the session; unauthorized users cannot read or change any record (verified by RLS tests, not only UI tests).
- All three ticket types capture every field of form v4 plus agreed additions.
- A request cannot close without Raju's execution sign-off and Moises's final confirmation signature; transitions outside the state machine are rejected by the database; no date on the record can be set earlier than the real event.
- AI proposals stay unsaved/draft until a human accepts them; the AI has no tool to approve, sign, submit, or close.
- Admins can add a field or app; existing requests and PDFs are unchanged.
- Signing shows a confirmation summary and records signer, server timestamp, and snapshot hash.
- A closed request exports a PDF named `firstname.lastname-<type>.pdf` that matches the stored snapshot.
- Reports use the agreed definitions and stored timestamps; exports are audited.
- Every create/edit/approve/sign/export/close appears in the append-only audit log.

---

## 15. Documentation Verification (Context7)

Context7 is connected. Verified 2026-09-30:

| Library | Context7 ID |
| --- | --- |
| Next.js | `/vercel/next.js` (latest indexed v16.2.x) |
| Clerk | `/clerk/clerk-docs` |
| Supabase | `/websites/supabase_guides`, `/supabase/supabase` |
| Vercel | `/vercel/vercel` |
| AI SDK | `/websites/ai-sdk_dev` |
| react-pdf | `/diegomura/react-pdf` |

### 15.1 Findings that change older tutorials / training data

| Topic | Current (verified) | Outdated — do not use |
| --- | --- | --- |
| Next.js request interception | `proxy.ts` exporting `proxy` (Node.js runtime only) | `middleware.ts` / `export function middleware` (deprecated) |
| Clerk route protection | `clerkMiddleware()` in `proxy.ts` + `auth.protect()` inside **each** page, Route Handler, and Server Action | `createRouteMatcher()` (deprecated; removed in next major) |
| Clerk conditional UI (Core 3, Mar 2026) | `<Show when="signed-in">` / `<Show when="signed-out">` | `<SignedIn>`, `<SignedOut>`, `<Protect>` (removed — throw errors) |
| Clerk provider placement | `<ClerkProvider>` **inside** `<body>` | Wrapping `<html>` |
| Clerk ↔ Supabase | Native third-party auth; Supabase client `accessToken()` returns Clerk token; publishable key | Clerk "JWT templates" + Supabase JWT secret |
| Supabase RLS for Clerk users | `auth.jwt() ->> 'sub'` compared to `text` columns | `auth.uid()` (expects UUID) |
| AI SDK tool approval | `tool({ inputSchema, needsApproval, execute })`; client `addToolApprovalResponse` + `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` | `parameters:` on tools; manual approval plumbing |

### 15.2 Reference snippets (from current docs — re-check against pinned versions at Foundation)

`proxy.ts`
```ts
import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware()

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
}
```

Server Supabase client with Clerk token
```ts
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

export function createServerSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { async accessToken() { return (await auth()).getToken() } },
  )
}
```

Per-resource protection (Route Handler / Server Action)
```ts
import { auth } from '@clerk/nextjs/server'

export async function GET() {
  const { userId } = await auth.protect()
  // then: check application role for userId before any data access
}
```

RLS helper (design sketch)
```sql
create policy "requesters read own requests"
on public.requests for select to authenticated
using ( requester_id = (select auth.jwt() ->> 'sub') );
```

Storage policy for signature uploads (design sketch)
```sql
create policy "users upload own signature"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'signatures' and
  (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);
```

Local Supabase config (`supabase/config.toml`)
```toml
[auth.third_party.clerk]
enabled = true
domain = "<your-instance>.clerk.accounts.dev"
```
Clerk session tokens must include `role: "authenticated"` — set up via Clerk's *Connect with Supabase* page.

AI tool requiring human approval
```ts
import { streamText, tool } from 'ai'
import { z } from 'zod'

const createDraftRequests = tool({
  description: 'Save accepted batch rows as draft requests',
  inputSchema: z.object({ rows: z.array(z.object({ /* … */ })) }),
  needsApproval: true,
  execute: async ({ rows }) => { /* re-check role, validate, insert drafts */ },
})
```

PDF (Route Handler, Node.js runtime)
```ts
import { renderToBuffer } from '@react-pdf/renderer'
const buffer = await renderToBuffer(<AccessRequestPdf snapshot={snapshot} />)
```

### 15.3 Still to verify at Foundation
- Exact package versions (`next`, `@clerk/nextjs`, `@supabase/supabase-js`, `ai`, `@ai-sdk/react`, provider package, `@react-pdf/renderer`, `zod`).
- Whether `@react-pdf/renderer` needs `serverExternalPackages` in `next.config.ts` on Next.js 16 (docs reference an older option name).
- AI SDK response helper for the pinned version (docs show both `toUIMessageStreamResponse` and `createUIMessageStreamResponse`), and client-side tools for field proposals.
- Clerk invitation-only / allowlist configuration and session lifetime settings.
- Vercel function duration limits for PDF and chat routes.
- Vitest, Playwright, and pgTAP setup with the Supabase CLI.

---

## 16. Risks

| Risk | Mitigation |
| --- | --- |
| Authorization bug exposes employee data | Server checks + RLS defence in depth + RLS test suite |
| AI writes wrong values | Proposals only; per-field/row human acceptance; audit `source = ai` |
| Prompt injection via uploaded batch files | No dangerous tools exist; server-side validation of all tool input |
| Signature image misused | Only owner can apply; private storage; audit record is the proof |
| Library API churn (Clerk Core 3, Next 16) | Pin versions; Context7 re-check on upgrades; CI |
| Scope creep (auto-provisioning) | Explicitly out of scope for v1 |
| No pre-provisioning authorization (by decision) | Truthful timestamps; Moises reviews every request; optional pre-approval setting can be added later; confirm with auditor |

---

## 17. Decisions to Confirm (Discovery)

**Resolved 2026-09-30:** roles (Raju = admin + requester + IT operator; Moises = approver + reviewer — Section 10.1); additional field = Country (Section 4.5); application catalog must be editable without code (Section 7).

1. **Auth:** *resolved 2026-10-01 (D1)* — **Clerk**, email + password, **MFA required**, invitation-only (sign-up restricted). No SSO for now; Microsoft 365 / Google SSO can be added later without redesign.
2. **Approval:** resolved — Moises signs once at the end (Section 5.1). Backup approver: an additional account with the Approver role (Section 10.1); person still to be named. Still open: how are role changes by an admin controlled (Section 10.1)? Is post-provisioning confirmation acceptable to Laine's auditor?
3. **Monthly metric:** "onboarded" = execution completed (proposed), final review, or closure?
4. **Signature:** *resolved 2026-09-30 (D13)* — **internal acknowledgment only**, a record that the onboarding process was carried out and approved; not a legally binding e-signature, so no e-signature provider. Users sign with an uploaded PNG signature or initials (PNG or typed). See `ROLES.md`.
5. **Edits after signing:** *resolved (design)* — any change after Raju signs (including after a return) clears his signature and requires signing again; closed requests are never edited (a new access-modification request is created instead).
6. **Fields:** Country agreed; revisit the deferred fields in 4.5 after the first weeks of use.
7. **RBAC templates:** store templates as data (4.4 #1)? Where is the current RBAC document?
8. **Access inventory for offboarding** (4.4 #2): include in v1?
9. **Data:** region *resolved 2026-10-01 (D2)* — Supabase **EU – Frankfurt (eu-central-1)**. Still open: retention for records, signatures, PDFs; backup requirements; company timezone for reports and SLAs (D3).
10. **AI:** provider and model (Claude direct vs. via OpenRouter); may employee personal data be sent; batch input format (CSV, XLSX, pasted text)?
11. **Notifications:** email (Resend) and/or Slack — v1 or phase 2?
12. **PDF filenames** for offboarding and access modification (proposed in 8.2); may drafts be exported?
13. **Existing records:** import past completed forms?
14. **Owners:** *accounts resolved 2026-10-01 (D12)* — Vercel, Supabase and Clerk are created on **Raju's personal accounts** (like the GitHub repo); app runs on the default `*.vercel.app` URL for now, a Laine subdomain is added before go-live. ⚠️ Before go-live, consider transferring the projects to Laine-owned accounts so the company owns the data (release R7). Still open: who approves go-live.
15. **SharePoint:** manual upload only, a "Save to SharePoint" button, or automatic save on close? Which site, library and folder? Who can create the Entra app registration and grant `Sites.Selected` access?
