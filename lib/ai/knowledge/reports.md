---
title: Reports
audience: all
summary: The ten reports, what each counts, the filters, the company timezone, exports — and custom reports made with the assistant.
---
*Reports* has ten reports. Dates use the **company timezone** (Asia/Dubai unless an admin changed it). Approvers see the same requests in reports as everywhere else — never drafts.

People:
- **All users list** — every request created in the period (not cancelled), newest first, with office and nationality.
- **Onboarded by month / country / department / office** — onboardings the approver confirmed and closed in the period ("onboarded" = closed by the approver).
- **Employees by office** — people employed today (an onboarding closed and no offboarding closed since), per office, the US by state and city; *Leaving* = an offboarding is open.

Sign-off & compliance:
- **Signature log** — when IT signed, when the approver confirmed, time to approve (from the first Review & sign, returns included).
- **Offboarding SLA** — removal deadlines in the period, met / missed / upcoming.
- **Access by application** — who holds each application, device or access type today.
- **Open requests by status** — where work is waiting right now, longest first.

**Filters:** period (month, 3 months, 12 months or dates), request type, office (+ US state and city), country, department, nationality ("Not set" finds requests made before the office field). **Exports:** CSV and PDF; every export is recorded in the audit log.

**Custom reports** (admins, approvers, auditors): ask the assistant for a report the ten don't give — any mix of people today, what they hold, requests, signatures and the offboarding SLA, with conditions (dates, day of month, weekday, "holds Slack and Monday.com", nationality, office…), grouping with counts or averages (for example time to approve per approver and month) and up to five parts in one report. If the request is vague, the assistant reads it back with real dates first. The report opens on its own page under *Your custom reports* (only the maker sees it; kept 60 days after the last change), says in plain words how it is built, reads the data again each time it opens, and exports as CSV, PDF or Excel — every export is in the audit log. The assistant can change it ("add their department") or you can delete it. It only uses data the app holds — no salaries, nothing from Slack itself.
