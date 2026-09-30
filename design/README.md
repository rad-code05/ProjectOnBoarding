# Design — Laine onboarding rights

UI design for the internal user access management app, styled after [laine.ai](https://laine.ai).

**Design canvas (source of truth for visuals):** https://claude.ai/artifact/Yb33RoTDGLAQphhBtU8wfD — private; share from the canvas's Share menu.

| Document | Contents |
| --- | --- |
| [tokens.md](tokens.md) | Colors, typography, spacing, radii, contrast rules, and the Tailwind v4 / `next/font` setup |
| [components.md](components.md) | Reusable component inventory: props, states, and where each is used |
| [sign-in.md](sign-in.md) | Sign-in page: layout, copy, states, behaviour (approved 2026-09-30) |
| [request-list.md](request-list.md) | Requests list — landing page after sign-in, with **New request** |
| [main-page.md](main-page.md) | Request form with the Laine robot assistant |
| [review-sign.md](review-sign.md) | Review & sign confirmation dialog |
| [pdf-export.md](pdf-export.md) | Closed request page: Download PDF, Save to SharePoint |
| [reports.md](reports.md) | Reports page: side panel of report types, charts, tables, CSV/PDF export |
| [approver-view.md](approver-view.md) | Moises's separate view: Approvals, Confirm & sign, Records, Reports |

## Principles

1. **Laine look:** sand background, black ink, Newsreader headings with an Instrument Serif italic accent, Raleway for everything else, pill buttons.
2. **Red means attention.** `#cf2e2e` is used only for errors, required-but-missing, and the current-location marker — never decoration beyond the brand rule on the sign-in panel.
3. **AI is always visibly separate.** Anything the assistant proposes has a dashed outline and a "Suggested" chip until a person accepts it.
4. **Accessible by default.** Real `<button>`, `<a>`, `<label>` + `<input>`; text contrast ≥ 4.5:1; errors are announced with `aria-invalid` / `aria-describedby`.
5. **Build once, reuse everywhere.** Every visual element on the canvas maps to one component in [components.md](components.md); screens are compositions of those components, not one-off markup.

## Status

| Screen | Status |
| --- | --- |
| Sign-in (desktop, error, mobile) | Approved |
| Sign-in — device verification code (Clerk `needs_client_trust`) | To design |
| Requests list (landing page) | Draft, awaiting review |
| Request form + assistant | Revision 2 (denser, two-column application access), awaiting review |
| Laine assistant robot (launcher) | Draft |
| Review & sign dialog (Raju) | Approved |
| Closed request · PDF export (Download / SharePoint) | Draft, awaiting review |
| Moises: Approvals landing, Confirm & sign | Draft, awaiting review |
| Components sheet | Draft |
| Reports | Draft, awaiting review |

### Not designed yet (priority order)
1. My profile — signature PNG upload
2. Admin — users & roles, app catalog, form fields & versions, RBAC templates, settings
3. Offboarding and access-modification variants of the request form
4. Returned request state (Moises's comment shown to Raju)
5. Batch onboarding review grid
6. Audit log
7. Generated PDF document layout
8. Read-only request view for approvers
9. Sign-in: device verification code, forgot password
10. Empty / 403 / 404 / loading / error states
11. (Phase 2) notification templates

## Canvas sources
`canvas/` holds a copy of every artboard (`*.dc.html`) and the layout index (`canvas.json`) from the live canvas, so the design survives outside claude.ai. Keep it in sync after canvas edits. `assets/laine-logo-white.png` is the logo the artboards use (uploaded to the canvas as `/_blob/17b23c9ce6dc5f048942c7b514470f03`).
