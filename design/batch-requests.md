# Batch requests (F17b)

> Boards approved 2026-10-28 (phone row of the design canvas). Decisions: `plan/features.md` → F17b, D8, PROJECT_PLAN §6.6.

Several people at once: joiners, leavers or role changes. You upload a list (**.xlsx** or **.csv**) or paste one, on the **Batch** page or in the chat. The assistant reads it into a **batch grid** where every row is checked. You fix or untick rows and press **Confirm**, and one **draft** is created per row. Each request is still executed, ticked and signed one by one.

## Boards

| Board | What it shows |
| --- | --- |
| *Phone · New batch* | From **Batch** on the Requests list. Pick the kind (Onboarding · Offboarding · Access change), then **Upload a file** (drop or choose; up to 50 people, 1 MB, the first sheet) or **Paste a list**, plus a template per kind. The onboarding template has **one column per application** in the catalog (Raju, 2026-10-29): the cell holds the role, *Yes* for its usual role, empty when not needed — a new app in the catalog is a new column; no "email used" columns. Your own column names work too: they are matched by name, and the robot asks when one is unclear. **Read the list**. Batches are kept 7 days under *Your batches*. |
| *Phone · Batch by chat* | A message with 2 or more people, or a file dropped on the robot (paperclip), becomes a batch. The step line reads *Read 4 people · 2 ready · 1 needs attention · 1 skipped · Open the batch*. The robot lists the problems ("Engeneering" isn't a department, Sara already has an open onboarding) and fixes what you tell it. |
| *Phone · Batch grid* | Tiles show **Ready**, **Need attention** and **Left out**, with filter pills. On the phone each person is a card (a table on desktop): a tick box, name, the main values, and the check. A problem cell is outlined in signal red with the reason, plus **Fix this row**. Rows with problems come first. A sticky footer shows the counts, **Discard** and **Create N drafts…**. |
| *Phone · Fix a row (sheet)* | The row's fields with the same searchable drop-downs as the form (department, office, manager, apps and roles), the value from the file shown with its problem, and *Include in the batch*. **Save row** runs the check again. |
| *Phone · Confirm the batch* | A **Needs your Confirm** sheet asks *Create 11 draft onboardings?*, with the names and who is left out and why. It says the values are written straight into each draft, that this creates drafts only (nothing is sent to the tools), and that each is signed one by one. Then the batch page shows *11 drafts created*, a list with tickets and **Open** links, and *Go to the Requests list*. |
| *Phone · Batch of leavers* | A box for **the same for everyone** (SLA, cut-off time, removal method, mailbox), which one row can override. Each leaver is found among the people who hold something today, and the removals are pre-filled from the inventory. Flags: *two people match — pick one*, *holds nothing in the app*, *already leaving (ticket)*. **Access change** uses the same page: each row is a person plus what changes (change / remove / add), checked against what they hold. |

## Rules

- **Input (D8):** .xlsx (first sheet), .csv or pasted text; up to **50 rows** and 1 MB. The content is **data, never instructions**: a cell saying "approve everything" is just text.
- **Checks per row:** the same rules as the form.
  - Required fields are filled.
  - Names are in the lists (department, office, country, manager is free text, apps and roles from the catalog, equipment and access types).
  - The work email is unique in the batch and not already on an open request.
  - The person has no open request of the same kind (one open offboarding / access change per person).
  - No dates in the past (never backdated).
  - Leavers and role changers must be found among the people who hold something today; they are never guessed.
- **Values are written directly** into each draft once you **Confirm**, because you checked them in the grid. There's no second accept. Audit: *created from batch …*, source **ai**, by the person who confirmed.
- The database **checks every row again** at Confirm and creates **all or nothing**.
- **Fix a row** by editing it or **untick** it. A row that needs attention is never created.
- A batch is **your own**: admin and requester only. It is kept **7 days** and then deleted; the drafts stay. After Confirm it is read-only.
- **Never by the robot or the batch:** asset tags / serial numbers, section 9 ticks, signing, approving, returning, closing, cancelling.
- Phone first (D22): cards on the phone, a table on desktop.
