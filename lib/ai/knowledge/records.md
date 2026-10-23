---
title: Records and the PDF
audience: all
summary: The record page of a closed request, the PDF record, its file name and fingerprint, Records list.
---
When the approver confirms, the request is **closed** and becomes a **record**:
- The **record page** shows the employee, what was granted, removed or changed, section 9, both signatures with server times, and the activity timeline.
- The **PDF record** is made once, at closing, in the company timezone: *Download PDF*. File name: `firstname.lastname-onboarding.pdf` (or `-offboarding`, `-access-modification`). A PDF exists only for approved requests — never for drafts.
- Every download is recorded in the audit log; the PDF has a fingerprint (SHA-256) so a copy can be checked against the original.

*Records* lists every closed request: search by name, email or ticket, filter by type, download from the list.
