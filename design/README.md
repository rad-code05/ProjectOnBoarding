# Design — Laine onboarding rights

UI design for the internal user access management app, styled after [laine.ai](https://laine.ai).

**Design canvas (source of truth for visuals):** https://claude.ai/artifact/Yb33RoTDGLAQphhBtU8wfD — private; share from the canvas's Share menu.

| Document | Contents |
| --- | --- |
| [tokens.md](tokens.md) | Colors, typography, spacing, radii, contrast rules, and the Tailwind v4 / `next/font` setup |
| [components.md](components.md) | Reusable component inventory: props, states, and where each is used |
| [sign-in.md](sign-in.md) | Sign-in page: layout, copy, states, behaviour (approved 2026-09-30) |
| [request-list.md](request-list.md) | Requests list — landing page after sign-in, with **New request** |
| [main-page.md](main-page.md) | Request form with the AI assistant side panel |

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
| Components sheet | Draft |
| Reports, audit log, admin, Review & sign dialog, batch review | Not started |
