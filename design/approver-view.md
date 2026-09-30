# Approver view — Moises (and backup approver)

**Status:** draft for review (2026-09-30) · Canvas row: *Moises — approver view*

The approver's job is limited to three things: **approve (confirm & sign)**, **look at reports**, and **export the PDF record**. The approver never creates or edits requests.

## Navigation

| Menu item | Purpose |
| --- | --- |
| **Approvals** (landing page after sign-in; badge = number waiting) | Requests Raju has signed that need confirmation |
| **Records** | Closed requests with PDF download / Save to SharePoint |
| **Reports** | Same reports as admin (read-only) |

Not shown to approvers: Requests list with **New request** / **Batch onboarding**, the request form, the Laine assistant robot, Audit log, Admin.

## Screens

### 1. Approvals (landing) — board *Moises · Approvals (landing)*
- Header "Approvals" + tiles: **Waiting for you**, Returned to Raju, Closed this month.
- **Waiting for you:** one card per request — employee, role, country, type chip, ticket, effective date, access summary, equipment, "Signed by IT: Raju Bholani · date", offboarding SLA note; **Review & confirm** button.
- **Recently closed:** compact table with **Download** and **SharePoint** buttons on each row; link to **All records**.
- Footer note: "You can confirm or return requests, view reports and export records. Creating and editing requests is done by IT."

### 2. Confirm & sign — board *Moises · Confirm & sign*
Modal over the request (read-only):
- Summary cards (Employee, Access & equipment) + link **View the full form (read-only)**.
- **IT execution · signed:** Raju's signature image, name, role, timestamp, checklist status (read-only).
- **Your signature:** Moises's saved PNG, "Approver · sections 3, 10, 11", timestamp set by the server.
- Required checkbox: "I have reviewed this record and approve the access and equipment as listed."
- **Return to Raju** (expandable, comment required) → request goes to *Returned*; Raju is notified.
- **Confirm, sign & close** → records signature, closes the request, generates the PDF, opens the closed record.

### 3. Closed record & export — board *Moises · Closed request · PDF export*
See [pdf-export.md](pdf-export.md). Nav shows **Records** active; back link "Back to approvals".

## Permissions (enforced on the server, not only hidden in the UI)

| Action | Raju (admin / IT) | Moises / backup (approver) |
| --- | --- | --- |
| See requests in Draft / In execution | ✓ | ✗ |
| See requests Awaiting confirmation, Returned, Closed | ✓ | ✓ (read-only) |
| Create / edit requests, use the assistant | ✓ | ✗ |
| Sign section 9 (IT execution) | ✓ | ✗ |
| Confirm & sign / Return (sections 3, 10, 11) | ✗ (never on own request) | ✓ |
| Reports | ✓ | ✓ (read-only) |
| Download PDF / Save to SharePoint | ✓ | ✓ |
| Admin (users, catalog, fields) | ✓ | ✗ |
