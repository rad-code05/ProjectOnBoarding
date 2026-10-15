# My profile, Admin & Audit log

**Status:** draft for review (2026-09-30) · Canvas row: *My profile, Admin & audit log*

## My profile — board *My profile · signature upload*
Opened from the name/avatar in the top bar (every role).
- **Account card:** name, email, roles, sign-in method + MFA, timezone, member since; **Manage password & MFA** (Clerk). Name/email/roles are admin-managed.
- **Signature & initials:** an internal record, not a legal e-signature (D13). Two slots — *Signature* (PNG, max 1 MB, transparent background recommended) and *Initials* (PNG **or typed**, up to 4 characters, previewed in Instrument Serif italic). One is **active**; the active one is applied when signing. Replace keeps old versions.
- **History:** every uploaded version with where it was used, so past PDFs keep the signature used at the time.
- Server side: PNG only, re-encoded, metadata stripped, stored in a private bucket under the user's ID.

### My profile on a phone (D22 — approved 2026-10-09)
Canvas boards: *Phone · My profile (timezone, signature & initials)*, *Phone · Replace signature (sheet)*, *Phone · Password & MFA*. **Timezone card (F05e, approved 2026-10-12):** "Show times on my screens in" — *Company default — Asia/Dubai* or any timezone; saves on change ("Saved · now 14:05 in Europe/Zurich"); note: only your screens change, the PDF record, ticket numbers, reports and SLA deadlines always use the company timezone. Replaces the read-only Timezone line of the account card.
- **Account card** (name, email, roles, sign-in + MFA, timezone, member since), **Manage password & MFA** (F05c), "managed by the admin" note.
- **Signature & initials → Sign with:** two cards with a radio — *Signature* (preview of the current PNG, upload date + size, **Replace** / **Upload**) and *Initials* (type up to 4 characters with an Instrument Serif italic preview + **Save**, or **upload initials as PNG**). The active card has a 2 px ink border and an **Active** pill. Two columns on desktop.
- **History:** every version with Active / Kept / Replaced; "Replacing keeps old versions…" note. (*Used on N requests* is added once signing exists, F06.)
- **Replace signature sheet:** choose a PNG (preview, name, size, dimensions), three checks with ✓ / ! (PNG, under 1 MB, at least 300 × 100 px — initials 60 × 40), note that it becomes active and the old one stays in History, **Cancel** / **Save as active** (enabled when all checks pass).
- **Decided 2026-10-09:** everyone uploads their own (Moises and Celine too); nobody — not even an admin — sees someone else's.
- **Draw your signature (F05d — board *Phone · Draw signature (sheet)*, approved 2026-10-09, built in F05d):** the Replace sheet gets a **Draw / Upload PNG** switch (Draw first). A pad (sand, dashed border, signing line with ×) takes finger or stylus; **Undo** (last stroke) and **Clear**; hint "turn the phone sideways for more room". **Save as active** is enabled once something is drawn; the drawing becomes a transparent PNG and goes through the same server checks and re-encode as an upload (`uploadSignature`), then shows in History like any version. Same sheet for initials, with a smaller pad.

## Admin (Raju only) — shared left sub-menu `AdminNav`
| Board | What it does |
| --- | --- |
| **Users & roles** | Table of people (roles as chips, status Active/Invited, MFA, last sign-in) + **Invite a person** panel (name, email, role checkboxes: Approver, IT operator, Admin, Auditor). Role rules shown: approver never sees drafts; no self-approval; you can't give yourself Approver; at least one approver must remain. Invitations are Clerk invitations (7-day expiry). |
| **Applications** | Category tabs with counts; table of apps (actions chips, permission-option chips, status, drag to reorder); **Edit** panel: name, category, allowed actions (Grant/Modify/Remove/Enroll/Disable), permission options (chip input), **Save**, **Retire**. Retired apps stay on old records. The assistant can create a catalog suggestion for Raju to confirm. |
| **Form fields** | Published version + draft version; table of fields (section, type, required, applies to, reportable, version added — Country highlighted as added in v4.1); **Publish vX**; **AI suggestions** panel (e.g. "Probation end date" requested via chat → Review & add to draft / Dismiss); version history. |
| **Templates & defaults** | **RBAC templates** (name, apps, times used, edit, new); **Defaults** (IT owner, primary approver, company timezone, ticket prefix); **Offboarding SLA** definitions + reminder; **PDF & SharePoint** (filename pattern, connection status/Connect, folder, auto-save on close). |

## Audit log — board *Audit log* (Raju; auditors read-only)
Filters: search, person, action, source (All / People / AI / System), period. Table: time, who, action, record, details (field-level before → after), source chip (People = outlined, AI = yellow, System = grey). **Export CSV**. Append-only — no edit/delete for anyone.

- **Phone boards (approved 2026-10-15, F11):** *Phone · Audit log* — title + "append-only" line, search, source pills, **Filters · N** button, active filters as chips ("Last 7 days ×", "Hiding test users ×"), count line, events grouped by day (avatar, "**Who** what happened", time · record, source chip), Show more, **Export these N events (CSV)** ("the export is itself recorded") · *Audit log filters (sheet)* — who, what happened (Requests · Signatures & approvals · Records & PDFs · Admin & catalog · Sign-in & accounts), when (Today / 7 days / 30 days / All or dates), **Hide the test users** (on) · *Audit event details (sheet)* — plain-words title, when (server time), who, record link, type, **What changed** (field / before / after), "Event #… · append-only" · *Request activity (timeline)* — on the request and record pages: newest first, key steps (signed, confirmed) as black dots, a return in signal red with the comment, notes shown, "Show earlier events".
- **Decided 2026-10-15:** the page is for admins and auditors; **every approver sees the request activity timeline on records only** (not drafts); test users hidden by default; export follows the filters and is audited.
