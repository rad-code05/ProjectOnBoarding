# My profile, Admin & Audit log

**Status:** draft for review (2026-09-30) · Canvas row: *My profile, Admin & audit log*

## My profile — board *My profile · signature upload*
Opened from the name/avatar in the top bar (every role).
- **Account card:** name, email, roles, sign-in method + MFA, timezone, member since; **Manage password & MFA** (Clerk). Name/email/roles are admin-managed.
- **Signature & initials:** two slots — *Signature* and *Initials* — each a PNG (max 1 MB, transparent background recommended). One is **active**; the active one is applied when signing. Replace keeps old versions.
- **History:** every uploaded version with where it was used, so past PDFs keep the signature used at the time.
- Server side: PNG only, re-encoded, metadata stripped, stored in a private bucket under the user's ID.

## Admin (Raju only) — shared left sub-menu `AdminNav`
| Board | What it does |
| --- | --- |
| **Users & roles** | Table of people (roles as chips, status Active/Invited, MFA, last sign-in) + **Invite a person** panel (name, email, role checkboxes: Approver, IT operator, Admin, Auditor). Role rules shown: approver never sees drafts; no self-approval; you can't give yourself Approver; at least one approver must remain. Invitations are Clerk invitations (7-day expiry). |
| **Applications** | Category tabs with counts; table of apps (actions chips, permission-option chips, status, drag to reorder); **Edit** panel: name, category, allowed actions (Grant/Modify/Remove/Enroll/Disable), permission options (chip input), **Save**, **Retire**. Retired apps stay on old records. The assistant can create a catalog suggestion for Raju to confirm. |
| **Form fields** | Published version + draft version; table of fields (section, type, required, applies to, reportable, version added — Country highlighted as added in v4.1); **Publish vX**; **AI suggestions** panel (e.g. "Probation end date" requested via chat → Review & add to draft / Dismiss); version history. |
| **Templates & defaults** | **RBAC templates** (name, apps, times used, edit, new); **Defaults** (IT owner, primary approver, company timezone, ticket prefix); **Offboarding SLA** definitions + reminder; **PDF & SharePoint** (filename pattern, connection status/Connect, folder, auto-save on close). |

## Audit log — board *Audit log* (Raju; auditors read-only)
Filters: search, person, action, source (All / People / AI / System), period. Table: time, who, action, record, details (field-level before → after), source chip (People = outlined, AI = yellow, System = grey). **Export CSV**. Append-only — no edit/delete for anyone.
