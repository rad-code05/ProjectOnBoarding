# Request variants: offboarding, access modification, returned, read-only, batch

**Status:** draft for review (2026-09-30) · Canvas row: *Request variants*

## Offboarding — board *Offboarding request*
- Ticket type **Offboarding** selected; the person is picked from existing employees (details read-only).
- **Access removal SLA (section 8) is first and always open**, outlined in signal red while due: countdown ("Due in 6h"), deadline, timeline (Same day / 24h / 48h), effective cut-off, last working day.
- Banner: "Pre-filled from the **access inventory**" — every app, device and access granted on earlier requests — with progress ("5 of 11 removed").
- **Applications to remove:** app, what they have today, action Remove, done checkbox with time.
- **Equipment to return** (status Return pending / Received), **Physical & logical access** (Disable / Remove + done), **Handover** (data & mailbox owner, account action e.g. suspend now, delete after 30 days).

## Access modification (same layout as offboarding)
The inventory shows what the person has today; each row can be **kept, changed** (new permission) or **removed**; new tools are added from the catalog. Section 8 hidden.

## Returned — board *Returned request (Raju)*
- Status pill **Returned** (signal outline); alert card "Returned by Moises Larez" with his comment, **Go to …** (jumps to the flagged section) and **Reply to Moises**.
- Note: sections 1–9 are unlocked; Raju's previous signature is removed (kept in the audit log); sign again via **Review & sign again**.
- Flagged items show a signal border and "Flagged by Moises".

## Read-only (approver) — board *Moises · Read-only request*
Opened from "View the full form" in Confirm & sign. Every applicable section as a read-only card (3 columns), header actions **Return to Raju** and **Confirm & sign**. No inputs, no assistant.

## Batch onboarding review — board *Batch onboarding review*
- Opened from **Batch onboarding** (requests list) or when a CSV/XLSX is dropped on the assistant.
- File chip + "6 rows read by the Laine assistant · nothing saved yet"; counts: ready / needs attention / duplicate.
- Grid: include checkbox, first, last, job title, department, country, effective date, RBAC template, **Check** column (Ready · "Country missing — required" in signal with the cell outlined · "Duplicate of UAM-… — skipped").
- **Create N draft requests** (only included, valid rows) · **Discard file**. Each draft keeps its values marked AI-suggested; each is still reviewed and signed individually.
