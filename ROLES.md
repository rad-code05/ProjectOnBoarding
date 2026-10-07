# Roles — Laine onboarding rights

Who uses the app, what each role can do, and how signing works. Decided with the product owner on 2026-09-30.

## People

| Person | Roles | In one line |
| --- | --- | --- |
| **Raju Bholani** | Admin · Requester · IT operator | Creates requests (by hand or with the Laine assistant), does the IT work, signs section 9, runs Admin. Main user. |
| **Moises Larez** | Approver | Confirms and signs at the end (or returns to Raju), views reports, exports PDFs. Nothing else. |
| **Celine** (backup approver, decided 2026-10-07) | Approver | Same rights as Moises, for when he is away. |

Accounts are created by Raju only (invitation). There is **no sign-up page**. Account help: "contact Raju".

## Roles

| Role | Can | Cannot |
| --- | --- | --- |
| **Admin** | Users & roles, applications catalog, form fields & versions, RBAC templates, defaults, audit log | Give themselves the Approver role; approve their own requests |
| **Requester / IT operator** | Create and edit requests, use the assistant and batch onboarding, record IT work, sign section 9 ("Review & sign"), cancel before signing | Approve or close requests |
| **Approver** | See requests that are *Awaiting confirmation*, *Returned* or *Closed* (read-only); **Confirm, sign & close** or **Return to Raju** (comment required); reports; download PDF / save to SharePoint | See drafts or in-progress requests; create or edit requests; use the assistant; Admin |
| **Auditor** (optional) | Read-only records, reports, audit log | Change anything |

A person can hold several roles. Permissions are enforced on the server and in the database, not only hidden on screen.

## What each person sees

| | Raju | Moises / backup |
| --- | --- | --- |
| Lands on | **Requests** list (+ New request, Batch onboarding) | **Approvals** (waiting for you, recently closed) |
| Top menu | Requests · Reports · Audit log · Admin | Approvals · Records · Reports |
| Laine robot assistant | Yes (on the request form) | No |

## Workflow and signing

1. Raju creates the request → **Draft** → does the work → **In execution**.
2. Raju clicks **Review & sign**, checks the summary, confirms → his signature is applied to section 9 (and the IT half of section 11) → **Awaiting confirmation**.
3. Moises reviews → **Confirm, sign & close** (sections 3, 10 and the approver half of 11) → **Closed**, PDF created. Or **Return to Raju** with a comment → **Returned** → Raju fixes and **signs again**.

**There is no approval before access is set up** — Moises signs once, at the end.

### The signature (decision D13, 2026-09-30)
- It is an **internal record** that the onboarding process was carried out and approved — **not a legally binding e-signature**. No e-signature provider is needed.
- Each person chooses in **My profile**: an uploaded **PNG signature**, or **initials** (uploaded PNG or typed). One is active at a time.
- It is applied only by the signed-in person, only after they confirm the summary, with the **server date and time** — dates are never typed or backdated.
- Old signature versions are kept so past records and PDFs show what was used at the time.

## Rules that never change
- Nobody approves a request they prepared or executed.
- At least one active approver must exist.
- The assistant never approves, signs, submits, closes or changes roles.
- Every action is written to the append-only audit log.
