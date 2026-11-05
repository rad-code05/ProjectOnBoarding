# Import of existing staff (F24)

People who joined Laine before this app come in **once**, from one reviewed file, with their real dates. Boards approved 2026-11-05 (Raju) on the design canvas, phone row: *Phone · Admin · Import existing staff*, *Phone · Import check*, *Phone · Confirm import + result*, *Phone · An imported person*.

## Boards

| Board | What it shows |
| --- | --- |
| **Admin · Import existing staff** | Upload `.xlsx` / `.csv` (up to 500 people), **Download the import template**, earlier imports (file, when, who, counts; discarded ones), black box *"The only place for past dates"*. Admin only; new row on the Admin home. |
| **Import check** | One card per person (like batches, F17b): problems first, *Fix this row*; past dates allowed here only and labelled *"From your file"*; a **leaver** card (*imported as onboarded and offboarded*); people already in the app **Skipped** (their real requests win). Bottom bar: *Import N people…* / Discard. |
| **Confirm import + result** | *"Import N people?"* — working here / leavers / left out and why; Imported records `IMP-…`, read-only, never signed, no PDF made by the app; all or nothing; file kept as evidence. Result: list of the records, *"N signed forms are still on SharePoint — attach them whenever you like"*, Download the import file. |
| **An imported person** | Record view with badge **Imported** and a **red note** *"Imported record — signed form on SharePoint"* + **Attach the signed PDF…** (optional, admin); employee details (*Started … From the import file*), access held with *since* dates, New access change / Start an offboarding. After a PDF is attached: a calm note *"original signed form attached"* + Download / Replace. |

## Rules

- **The only place for past dates.** Start dates, leave dates and access *since* dates come from the file; everywhere else the app sets dates itself. The import itself is audited with server time (`import.person` per person, `import.completed`, `import.discarded`).
- **One Imported record per person** — a closed onboarding, ticket `IMP-<start year>-NNNNNN` (its own series; `UAM-…` numbers are untouched), dated noon of the start date in the company timezone. A **leaver** also gets a closed imported offboarding on the leave date; their access ends then. No snapshot, signature, approval or app-made PDF — never shown as signed.
- **Counted everywhere:** reports (by month, country, department, office, nationality, Employees by office, All users), Access by application, the assistant, Who is leaving / changing.
- **Checked twice** — by the app (F24b, the grid) and again at Confirm by the database: work email not already in the app, first + last name and start date present, no date in the future, leave date between start and today, applications and roles from the catalog (an application not in the catalog is kept as *Other* by name), offices from the list.
- **Skipped:** anyone already in the app (their real requests win).
- **The file is kept as evidence** in the private `imports` bucket (admins only, never replaced).
- **Signed forms:** the red note stays until the original signed PDF is attached (F24d: optional, admin, private, audited); reports mark imported people and add a footnote.
- **The real data:** Raju's sheets + application screenshots are matched by Claude into one clean file in the template (difference list decided item by item), trial-imported into the dev database, then imported into production. The sheets stay in git-ignored `Rajulearning/`.
