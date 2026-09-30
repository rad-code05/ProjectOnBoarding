# Reports

**Status:** draft for review (2026-09-30) · Canvas board: *Reports (Raju & Moises)* — interactive: click a report type in Play mode

One Reports page for both roles (Raju: full; Moises / backup approver: read-only, same reports). Sample data in the mockup is illustrative only.

## Layout

1. **Left side panel — report types** (280px), grouped:

   | Group | Report | What it answers |
   | --- | --- | --- |
   | People | **All users list** | Everyone with a request: email, department, country, type, status, effective and closed dates |
   | People | **Onboarded by month** | Completed onboardings per month (chart + table) |
   | People | **Onboarded by country** | Completed onboardings grouped by Country |
   | People | **Onboarded by department** | Completed onboardings grouped by Department / Team |
   | Sign-off & compliance | **Signature log** | When Raju signed (IT execution) and when Moises approved, time to approve, PDF created |
   | Sign-off & compliance | **Offboarding SLA** | Agreed removal timeline vs. actual; met / missed with reason |
   | Sign-off & compliance | **Access by application** | Who currently holds access to each tool (access inventory) |
   | Sign-off & compliance | **Open requests by status** | Where work is waiting |

   The selected report is outlined in black. The list is data-driven so more report types can be added later.

2. **Report header** — report name, "Definition" line (exactly how the numbers are counted), **Export CSV** and **Export PDF**.
3. **Filters (one row)** — period (This month / Last 3 months / Last 12 months / Custom), ticket type, country, department; the active range is shown on the right.
4. **Visual** (when the report has one):
   - *Onboarded by month:* three stat tiles (this month, last 12 months, busiest month) + vertical bar chart, one bar per month; hover a bar for the exact value.
   - *By country / department / application / status:* horizontal bars with the value at the end of each bar.
5. **Table** — every report has a table (it is the chart's accessible equivalent and what CSV export contains).

## Chart rules
- Single series → one ink colour (#000000), no legend; bars have 4px rounded data ends anchored to the baseline; recessive grid (#ece6db); axis labels in graphite.
- Hover: bars not under the pointer fade to stone (#7e7e7e) and a readout shows "Aug 2026 · 7 onboarded".
- Status results (SLA Met / Missed) always use a word, never colour alone; Missed and "Due in 6h" use signal red.

## Definitions (to confirm — see PROJECT_PLAN §9)
- **Onboarded** = onboarding request whose IT execution was completed in the period (company timezone); drafts and cancelled excluded.
- Country / department use the values on the request at the time it closed.
- Signature times are the server timestamps recorded at signing.

## Exports
- **CSV:** the table as shown, with active filters; file name e.g. `onboarded-by-month_2025-10_2026-09.csv`.
- **PDF:** report title, definition, filters, chart and table, generated time and who generated it.
- Every export is written to the audit log. Moises can export reports too.

## Components used
`ReportNav` (new), `ReportHeader` (new), `FilterBar`, `StatTile`, `BarChart` (new, vertical), `HBarChart` (new, horizontal), `DataTable` (new), `Button`, `SegmentedControl`, `SelectField`.
