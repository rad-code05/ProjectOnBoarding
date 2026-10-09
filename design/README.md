# Design — Laine onboarding rights

UI design for the internal user access management app, styled after [laine.ai](https://laine.ai).

**Design canvas (source of truth for visuals):** https://claude.ai/artifact/Yb33RoTDGLAQphhBtU8wfD — private; share from the canvas's Share menu. A copy of every board is in [canvas/](canvas/).

| Document | Contents |
| --- | --- |
| [colours.md](colours.md) | Colour palette, where each colour is used, and the colour rules |
| [tokens.md](tokens.md) | Colors, typography, spacing, radii, contrast rules, and the Tailwind v4 / `next/font` setup |
| [components.md](components.md) | Reusable component inventory: props, states, and where each is used |
| [sign-in.md](sign-in.md) | Sign-in, wrong password, mobile, new-device code, reset password |
| [request-list.md](request-list.md) | Requests list — Raju's landing page, with **New request** |
| [main-page.md](main-page.md) | Request form (onboarding) with the Laine robot assistant |
| [request-variants.md](request-variants.md) | Offboarding, access modification, returned, read-only (approver), batch review |
| [review-sign.md](review-sign.md) | Review & sign confirmation dialog (Raju) |
| [approver-view.md](approver-view.md) | Moises's view: Approvals, Confirm & sign, Records, Reports |
| [pdf-export.md](pdf-export.md) | Closed request page: Download PDF, Save to SharePoint |
| [reports.md](reports.md) | Reports: side panel of report types, charts, tables, CSV/PDF export |
| [profile-admin.md](profile-admin.md) | My profile (signature upload), Admin (users, applications, fields, templates & defaults), Audit log |
| [records-states.md](records-states.md) | Generated PDF layout, system states (empty/403/404/loading/errors), email notifications |

## Principles

1. **Laine look:** sand background, black ink, Newsreader headings with an Instrument Serif italic accent, Raleway for everything else, pill buttons.
2. **Red means attention.** `#cf2e2e` is used only for errors, required-but-missing, due SLAs and the current-location marker — never decoration beyond the brand rule on the sign-in panel.
3. **AI is always visibly separate.** Anything the assistant proposes has a dashed outline and a "Suggested"/"AI" chip until a person accepts it.
4. **Accessible by default.** Real `<button>`, `<a>`, `<label>` + `<input>`; text contrast ≥ 4.5:1; errors are announced with `aria-invalid` / `aria-describedby`.
5. **Mobile-first (decision D22, 2026-10-07).** Every screen works on phones — iPhone regular (~390–393 px), Plus / Pro Max (~428–440 px), Samsung Galaxy S24 Ultra (~412 px) — and on desktop (boards are drawn at 1440 px). Each screen gets a phone layout on the canvas before it is built.
6. **Build once, reuse everywhere.** Every visual element maps to one component in [components.md](components.md). On the canvas, `TopBar`, `BrandPanel` and `AdminNav` are real shared components imported by the newer boards.

## Status (2026-09-30)

All planned screens now have a first design. Nothing is built yet.

| Screen | Status |
| --- | --- |
| Sign-in (desktop, error, mobile) | Approved |
| Review & sign dialog (Raju) | Approved |
| Requests list · Request form + robot assistant · Robot states | Reviewed, changes applied |
| Moises: Approvals, Confirm & sign, Read-only request, Records/PDF export | Draft, awaiting review |
| Reports | Draft, awaiting review |
| Sign-in: new-device code, reset password | Draft, awaiting review |
| My profile · Admin (4 screens) · Audit log | Draft, awaiting review |
| Offboarding · Returned · Batch review (access modification described in spec) | Draft, awaiting review |
| PDF document (2 pages) · System states · Email notifications (phase 2) | Draft, awaiting review |
| Components sheet · shared components (TopBar, BrandPanel, AdminNav) | Draft |
| Phone (D22): app shell (menu closed/open) · requests list (+ empty) · request form sections 1–2 (+ changed elsewhere) | Approved (2026-10-07) |
| Phone (D22): sections 4–5 application access (+ edit-an-app sheet) | Approved (2026-10-08) |
| Phone (D22): sections 6–7 equipment & physical access (+ add-equipment sheet) | Approved (2026-10-08) |
| Phone (D22): in execution / section 9, Start execution, Cancel request | Approved (2026-10-08) |
| Phone (D22): My profile, Replace signature, Password & MFA, Draw signature, Review & sign | Approved (2026-10-09) |

## Canvas sources
`canvas/` holds a copy of every artboard (`*.dc.html`) and the layout index (`canvas.json`) from the live canvas, so the design survives outside claude.ai. Keep it in sync after canvas edits. `assets/laine-logo-white.png` is the logo the artboards use (uploaded to the canvas as `/_blob/17b23c9ce6dc5f048942c7b514470f03`).
