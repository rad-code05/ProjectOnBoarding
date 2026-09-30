# Review & sign dialog

**Status:** draft for review · Canvas board: *Review & sign dialog*

Opened by the **Review & sign** button on the request form when Raju has finished the IT work. It is the confirmation step before Raju's signature is applied (Section 9) and the request goes to Moises.

## Behaviour

1. Modal dialog over the dimmed form (`role="dialog"`, `aria-modal`, focus trapped, Esc / ✕ closes without signing).
2. **Blocking checks** at the top. Signing is disabled until every check passes:
   - all required fields complete;
   - no AI suggestions left unaccepted;
   - the IT execution checklist items that apply to the ticket type are ticked;
   - the signer has a signature PNG on file.
   A failing check shows in signal red with a link to the field or section to fix.
3. **Read-only summary** of what is being signed: Employee, Access & equipment, Section 9 checklist and notes. Each card has **Edit**, which closes the dialog and scrolls to that section.
4. **Signature block:** preview of the signer's saved PNG (from *My profile*, with a link to change it) and what will be recorded: signer, role, section, form version. The date and time are **set by the server at the moment of signing** — the dialog never shows an editable date.
5. **Confirmation checkbox** (required): "I confirm the details above are correct and the IT work was carried out as recorded."
6. **Sign & send to Moises** (primary) is enabled only when all checks pass and the box is ticked. **Back to edit** returns to the form.

## What signing does (server)
- Checks the signer's identity and role again, and that the request is still in the expected state and version.
- Stores a snapshot of the request and its SHA-256 hash, the signature image reference, signer, role, section, form version and server timestamp.
- Locks sections 1–9; moves the request to **Awaiting confirmation**; writes an audit event; notifies approvers (phase 2).
- Shows a confirmation toast on the form: "Signed and sent to Moises".

## Moises's version (to design next)
Same dialog layout, opened from **Confirm & sign** when the request is *Awaiting confirmation*: summary + Raju's signature (read-only) + Moises's signature block, confirmation checkbox, and two actions: **Return to Raju** (comment required) and **Confirm, sign & close** (generates the PDF `firstname.lastname-onboarding.pdf`).

## Components used
`Dialog` (new), `CheckRow` (new), `SummaryCard` (new), `SignatureBlock` (new), `Checkbox` (new), `Button`.
