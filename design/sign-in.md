# Sign-in page

**Status:** approved 2026-09-30 · Canvas boards: *Sign-in · Desktop*, *Sign-in · Wrong password*, *Sign-in · Mobile*

## Behaviour

- Internal use only: **sign-in page only, no sign-up page or link.** Clerk sign-up mode is set to **Restricted**; any sign-up attempt returns `sign_up_mode_restricted`.
- Accounts are created by Raju (admin): Raju, Moises, and the backup approver.
- Any signed-out visit to an app page (including the main page `/`) redirects to `/sign-in`. After sign-in the user lands on the main page, *Laine onboarding rights*.
- Signed-in users visiting `/sign-in` are sent to `/`.
- Sign-out: the sign-out button in the top bar ends the Clerk session and returns to `/sign-in`.

## Layout

**Desktop (1440×900):** `AuthLayout`
- **Left — `BrandPanel` (620px, black):** white Laine logo; eyebrow "INTERNAL · IT ACCESS MANAGEMENT" (stone); title "Laine *onboarding* rights" (Newsreader 72px, "onboarding" in Instrument Serif italic, white); 48×3px signal rule; tagline (stone); footer row "01 Prepare · 02 Execute · 03 Confirm".
- **Right — sand:** "Internal use only" (top right, graphite); form 400px wide, centred; footer "© 2026 Laine" / "Secured sign-in".

**Mobile (390×844):** brand panel becomes a compact black header (logo, 40px title, rule); form below on sand; the notice sits at the bottom.

## Form

| Element | Spec |
| --- | --- |
| Heading | "Sign in" — Newsreader 44px (mobile 32px) |
| Subheading | "Use the account your administrator created for you." — graphite 15px |
| Work email | `TextField`, type email, placeholder `name@laine.ai` |
| Password | `PasswordField`; "Forgot password?" link right of the label |
| Submit | `Button` primary, `lg` (52px), full width: "Sign in" |
| Notice | Lock icon + "Access is by invitation only. There is no self sign-up — contact Raju if you need an account." (mobile: "Invitation only — no self sign-up. Contact Raju for an account.") |

## States

| State | Display |
| --- | --- |
| Default | As above |
| Submitting | Button shows loading state, disabled (`fetchStatus === 'fetching'`) |
| Wrong email or password | Password field 2px signal border, `aria-invalid="true"`; `InlineError` "Email or password is incorrect." (don't reveal which one was wrong) |
| New device (`needs_client_trust`) | Separate step: "Check your email" + 6-digit code field + "Send a new code" — **to design** |
| Forgot password | Clerk reset-password custom flow — **to design** |

## Copy rules
- Say "Raju" for account help (per product owner).
- Never mention sign-up, free trial, or marketing copy from laine.ai.
