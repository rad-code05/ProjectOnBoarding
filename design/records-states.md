# PDF document, system states & email notifications

**Status:** draft for review (2026-09-30) · Canvas row: *PDF record, system states & email notifications*

## Generated PDF — boards *PDF record · page 1 / page 2* (A4)
Mirrors the 11 sections of form v4 so it reads like the paper form.
- **Page 1:** black header band (white Laine logo, "User Access Management Record", type · ticket · form version); sections 1–5 as two-column tables (label on sand, value on white; black section bars).
- **Page 2:** running header (employee · ticket); sections 6–10; **11 Signatures** — two blocks (IT execution: Raju; Authorizing approver: Moises) each with signature image, line, name + role, server timestamp; statement that signatures were applied by the authenticated signer and the audit trail is kept in the app.
- **Footer on every page:** generated time + timezone, "from the signed snapshot", SHA-256 fingerprint, page X of Y; page 2 footer also shows the file name.
- Section 5 lists only applications with an action, plus "All other catalog applications: No change". Section 8 shows "Offboarding only — not applicable" on onboarding.
- Built with `@react-pdf/renderer` from the stored snapshot; fonts embedded (Raleway, Newsreader).

## System states — board *System states*
| State | Content |
| --- | --- |
| Empty requests list | Robot, "No requests yet", **New request** |
| Empty approvals (Moises) | Happy robot, "All caught up", link to Records |
| 403 | "You don't have access to this page", contact Raju, **Go to my start page** |
| 404 | "Request not found", **Back to requests** |
| Loading | Skeleton blocks in the page layout; pulse off with reduced motion |
| Errors | Save conflict ("Someone else updated this request" → **Reload and merge**, edits kept), offline banner, SharePoint save failed → **Retry** |

## Email notifications (phase 2) — board *Email notifications*
Sent with Resend. Black header with logo, title, one-line body, fact strip, one button, footer "internal system; no personal details beyond the name".
1. **To approvers:** "Waiting for your confirmation: <name>" → Review & confirm.
2. **To Raju:** "Returned by Moises: <name>" with the comment excerpt → Open request.
3. **To Raju:** "SLA due in 6h: <name> offboarding" with progress → Open offboarding.
