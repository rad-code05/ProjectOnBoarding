# Custom reports (F17a)

> Boards approved 2026-10-25 (phone row of the design canvas). Decisions: `plan/features.md` → F17a, PROJECT_PLAN §6.6 (report language).

The robot builds a report the standard Reports page doesn't have — any combination the stored data can answer — by writing a **definition in the report language** (data sets, conditions, grouping, parts). The server checks it against the person's roles and runs it with their own access. The robot never writes database queries.

## Boards

| Board | What it shows |
| --- | --- |
| *Phone · Custom report: the robot checks how it read the request* | A long request; the robot reads it back as a numbered list (relative dates as real dates, "both apps", nationality vs work country, even days) and asks *Shall I build it like this?*; quick answers. A clear request is built straight away. |
| *Phone · Custom report ready in the chat …, then changed* | Step line **Built a custom report · N parts · Open the report · CSV · PDF · Excel**; an answer card per part (title — count, rules in plain words, first names); the source line ("data sets …, as of now"). A follow-up ("add their department") changes the **same** report (same link): step line *Changed the custom report*. |
| *Phone · Custom report page* | `/reports/custom/[id]`: eyebrow *Custom report · made with the assistant*, title, *Made by … on … (Dubai) · data as of now · kept 60 days*; **How this report is built** (open by default, one line per part); each part = heading + count + cards (or a table on desktop); export box **CSV · PDF · Excel** (CSV one file with a Part column, Excel one sheet per part, audited); *Change it with the assistant*, *Delete*. |
| *Phone · Reports with Your custom reports* | Reports page: **Your custom reports** group first (title, parts, made on; own only, kept 60 days), then the standard groups. |
| *Phone · Custom report grouped, with a chart* | A grouped report (average time to approve per approver and month): two summary tiles, **one bar list per approver** (small multiples, all bars ink — identity from the heading, not colour), "none" for empty months, *Show as a table*, exports (PDF = chart + table). |

## Rules

- Live data: the definition (incl. the real dates) is fixed when built; the rows are read again on every open and export ("data as of now").
- Who: everyone with Reports (admin, requester, IT operator, approver, auditor); a custom report is visible to its maker only. Approvers see what they see everywhere (no drafts).
- Limits: up to 5 parts; a row limit per part (the page says when a part is cut and suggests narrowing it).
- Wording: plain words, company timezone (Dubai) for dates, "Onboarded" = closed by the approver (D16).
- Phone first (D22): cards on phone, tables from desktop width; no sideways scroll.
