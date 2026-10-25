# Filling requests by chat (F16)

> Boards approved 2026-10-25 (phone row of the design canvas). Decisions: `plan/features.md` → F16, PROJECT_PLAN §6.5–6.6.

You tell the robot who joins, leaves or changes role. It asks for what is missing, creates the **draft** after your **Confirm**, and fills the form with **suggestions** you accept or reject one by one (or all at once). The robot never ticks section 9, signs, approves, returns, closes or cancels.

## Boards

| Board | What it shows |
| --- | --- |
| *Phone · Filling by chat: follow-up questions* | "Onboard Meera Nair, Dubai, Engineering, starts Monday, Slack, GitHub, Google Workspace and a laptop" → the robot lists only what is missing (manager, work email, roles — the department's usual ones offered, nationality optional), turns "Monday" into a real date (company time) and offers quick answers. Unknown names, offices or apps → it asks, never guesses. |
| *Phone · Filling by chat: Confirm creates the draft* | A **Needs your Confirm** card (black border): every value it will suggest, "creates a draft only — nothing is sent to the tools", *Confirm — create the draft* / *Not now*. Then the step line *Created the draft UAM-… · N suggestions waiting · Open the draft*. |
| *Phone · Draft with the assistant's suggestions (sections 1–2)* | Black banner *N suggestions from the assistant · Accept all N · Next suggestion · Reject all*; each suggested field has a **dashed** outline, the value, *Suggested · reason*, **Accept / Reject**; accepted fields say *✓ Accepted from the assistant*; the robot badge counts what is still waiting. |
| *Phone · Suggested applications, equipment and access (sections 5–7)* | Suggested rows dashed until accepted: *Accept · Change role (Change) · Reject*; *Change* opens the normal sheet pre-filled. Only catalog apps, roles and types; asset tags and serial numbers stay yours. |
| *Phone · Offboarding by chat* | "Arjun Mehta is leaving Friday…" → the robot reads what he holds (inventory), asks *Suspend or Delete?* and *shared mailbox?*, then a Confirm card: last working day, SLA, removals, equipment returns, access, mailbox, handover. An access change works the same way (keep / change / remove). |

## Rules

- **Creating a draft** is the only thing the robot saves by itself, and only after the Confirm card (audited `source = ai`). "Not now" leaves nothing behind.
- **Every value is a suggestion** until accepted. Accepting saves it exactly like typing (same checks, autosave, "changed elsewhere"), audited `source = ai`; typing over a suggestion replaces it; rejecting leaves the field as it was.
- *Accept all* asks once more when there are more than 10.
- **Review & sign** lists suggestions not yet reviewed as a **warning**, never a blocker.
- **Never by the robot:** section 9 ticks (it may draft section 9 notes as suggestions), asset tags / serial numbers, signing, approving, returning, closing, cancelling, roles or settings.
- One open offboarding / access change per person: the robot says so and offers to open the existing one.
- Who: admin and requester (the IT side that creates requests). Approvers keep report questions only.
- Phone first (D22): the same suggestions show on desktop in the two-column form.
