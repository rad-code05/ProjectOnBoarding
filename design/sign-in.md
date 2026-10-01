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
| New device (`needs_client_trust`) | Board *Sign-in · New device code*: "Check your email", six single-digit boxes, 10-minute expiry note, **Verify and continue**, **Send a new code**, back to sign in |
| Forgot password | Board *Sign-in · Reset password*: step 1 work email → **Send reset code**; step 2 code + new password with live rules (≥ 12 characters, not in known breaches) → **Save and sign in**. "Forgot password?" on the sign-in page links here |

Both reuse the shared `BrandPanel` component.

## Built in S5 (2026-10-01) — all screens in our design, none from Clerk's UI
| Route | Screens |
| --- | --- |
| `/sign-in` | Sign in (email + password) → **Two-step check** (authenticator code, or "Use a backup code instead") → or **Check your email** (new-device code) |
| `/reset-password` | Step 1 work email → Step 2 code + new password → second factor if needed |
| `/session-tasks` | First sign-in only: **Protect your account** → **Scan the code** (QR + manual key) → **Save your backup codes** (download as .txt, confirm checkbox) → app |

Implementation notes:
- Code entry is **one input** styled with large, spaced Newsreader digits (instead of six boxes) — works with paste, password managers, iOS/Android one-time-code autofill and screen readers.
- Wrong email and wrong password show the same message ("Email or password is incorrect.") so the page never reveals which accounts exist.
- Clerk's *Require MFA* applies from the **next** sign-in after it is switched on.
- MFA (authenticator app, backup codes) is a Clerk **Pro** feature in production — see decision D15.

## Copy rules
- Say "Raju" for account help (per product owner).
- Never mention sign-up, free trial, or marketing copy from laine.ai.
