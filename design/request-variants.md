# Request variants: offboarding, access modification, returned, read-only, batch

**Status:** draft for review (2026-09-30) · Canvas row: *Request variants*

## Offboarding — board *Offboarding request*
- Ticket type **Offboarding** selected; the person is picked from existing employees (details read-only).
- **Access removal SLA (section 8) is first and always open**, outlined in signal red while due: countdown ("Due in 6h"), deadline, timeline (Same day / 24h / 48h), effective cut-off, last working day.
- Banner: "Pre-filled from the **access inventory**" — every app, device and access granted on earlier requests — with progress ("5 of 11 removed").
- **Applications to remove:** app, what they have today, action Remove, done checkbox with time.
- **Equipment to return** (status Return pending / Received), **Physical & logical access** (Disable / Remove + done), **Handover** (data & mailbox owner, account action e.g. suspend now, delete after 30 days).

- **Phone boards (approved 2026-10-12, F09):** *Start an offboarding (who is leaving?)* — New request → Offboarding → pick the person from the access inventory ("11 items on record"), one open offboarding per person, *Start an empty offboarding* for people not in the app yet (until the F24 import) · *Offboarding draft* — section 8 first (timeline Same day / 24h / 48h, last working day, cut-off date + time → deadline in Dubai time, fixed when execution starts), pre-fill banner, section 2 read-only from the last request, sections 5–7 as "to remove / return" counts, **Handover** (data & mailbox owner, account action, delete-on date) · *Offboarding in execution* — SLA countdown (signal outline), progress "5 of 10 removed" (apps + access; equipment apart), tick each removal (server time), Add an app to remove, equipment row → sheet, Review & sign opens when every removal is ticked and equipment is settled · *Equipment return (sheet)* — Return pending / Received / Not returned + required reason · *SLA missed or met* — "Late by 3h 12m" with the required reason, or "Removed in time", plus the new Review & sign checks.
- **Decided 2026-10-12:** Same day = 23:59 of the cut-off day; 24h / 48h = cut-off + 24 / 48 h (company timezone); met / missed from the last removal tick; equipment outside the SLA and may close as Not returned with a reason.

- **Built in F09 (2026-10-13):** everything above, with the later decision: each application row has its own removal method (Delete / Suspend / Disable) and the Handover card a required mailbox choice (converted to a shared mailbox / no mailbox to convert); SLA badge in the Requests list; section 8 on the record page and the PDF.

## Access modification (same layout as offboarding)
The inventory shows what the person has today; each row can be **kept, changed** (new permission) or **removed**; new tools are added from the catalog. Section 8 hidden.

- **Phone boards (approved 2026-10-14, F10):** *Start an access change (who is changing?)* — New request → **Access change** → pick the person ("12 items on record"); people with an access change already open or leaving (offboarding open) can't be picked; *Start an empty access change* for people not in the app yet · *Access change draft (keep / change / remove)* — note "What Anna has today, from her access inventory … everything is kept unless you change or remove it"; section 2 editable with "Was: …" under changed fields; section 5 rows with **Keep / Change / Remove** (changed "Editor → Admin", removed "Will be removed · had User", new rows dashed with *New* + *Take off*), *Show N more kept apps*, *Add an application*; section 6 devices **Keep / Return** + *Issue another device*; section 7 access Keep / Change / Remove + *Add access*; sections 9–11 locked; no section 8 · *Change an app's permission (sheet)* — "Anna has today: Editor · granted on …", new permission (today's one dashed), *Keep Editor* / *Change to Admin*; several roles → checkboxes · *Access change record (what changed)* — `anna.keller-access-modification.pdf`, **What changed**: Employee (was → now), Changed, Added, Removed, Kept unchanged (frozen at signing).
- **Decided 2026-10-14:** only changes are stored (kept = no line), each linked to the inventory row it changes; one open access change per person, none while leaving; devices Keep / Return.
- **Built (F10b–F10c, 2026-10-14):** Who is changing? in the New request sheet; the draft shows the inventory note, *Applications / Devices / Access they have* with Keep / Change / Remove (Keep / Return for devices) above the regular sections 5–7 (which add something new and leave out what is held), the Change sheet, and "Was: …" under changed section 2 fields. Small difference from the board: held rows sit in their own card above each section instead of inside it.

## Returned — board *Returned request (Raju)*
- Status pill **Returned** (signal outline); alert card "Returned by Moises Larez" with his comment, **Go to …** (jumps to the flagged section) and **Reply to Moises**.
- Note: sections 1–9 are unlocked; Raju's previous signature is removed (kept in the audit log); sign again via **Review & sign again**.
- Flagged items show a signal border and "Flagged by Moises".
- **Phone board** *Phone · Returned request (Raju)* (approved 2026-10-09). **Decided:** whole **sections** are flagged (not single items); **Reply to Moises** = one optional note written in **Review & sign again**, shown to Moises on his next review (every round kept). **Built in F07c (2026-10-11):** comment card + Go to, flagged sections (also marked in the section chips / rail), **Review & sign again** with the optional note.

## Read-only (approver) — board *Moises · Read-only request*
Opened from "View the full form" in Confirm & sign. Every applicable section as a read-only card (3 columns), header actions **Return to Raju** and **Confirm & sign**. No inputs, no assistant.

## Batch onboarding review — board *Batch onboarding review*
- Opened from **Batch onboarding** (requests list) or when a CSV/XLSX is dropped on the assistant.
- File chip + "6 rows read by the Laine assistant · nothing saved yet"; counts: ready / needs attention / duplicate.
- Grid: include checkbox, first, last, job title, department, country, effective date, RBAC template, **Check** column (Ready · "Country missing — required" in signal with the cell outlined · "Duplicate of UAM-… — skipped").
- **Create N draft requests** (only included, valid rows) · **Discard file**. Each draft keeps its values marked AI-suggested; each is still reviewed and signed individually.
