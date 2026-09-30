# Reusable components

Every screen is composed from these components. Each maps to one React component in `components/` (UI primitives in `components/ui/`, app-specific pieces in `components/<area>/`). Visual reference: the **Components** board on the design canvas.

Rules:
- Components take data and callbacks through props; they never fetch data or check permissions themselves (pages and Server Actions do).
- Styling uses only the tokens in [tokens.md](tokens.md) — no raw hex values in components.
- Every interactive component is keyboard-accessible and labelled.

## UI primitives (`components/ui/`)

| Component | Props (main) | Variants / states | Used in |
| --- | --- | --- | --- |
| `Button` | `variant`, `size`, `disabled`, `loading`, `iconLeft` | `primary` (black pill) · `secondary` (outline pill) · `text` (underlined) · `destructive` (signal outline) · sizes `sm` 36px / `md` 44px / `lg` 52px | Everywhere |
| `IconButton` | `icon`, `label` (required → `aria-label`), `variant` | outline · solid · ghost | Sign out, attach, send, accept/reject |
| `TextField` | `label`, `name`, `value`, `error`, `hint`, `required`, `readOnly`, `suggestion` | default · error (2px signal border + message) · read-only (sand fill) · suggested (see `SuggestedField`) | Sign-in, all form sections |
| `PasswordField` | `TextField` props | show/hide toggle | Sign-in |
| `SelectField` | `label`, `options`, `value`, `error` | as TextField | Priority, assignee, country, permission |
| `DateField` | `label`, `value`, `error` | as TextField | Effective date |
| `SegmentedControl` | `options`, `value`, `onChange`, `label` | selected = black pill; `role="radiogroup"` | Ticket type, assistant mode |
| `StatusPill` | `status` | draft · in_execution · pending_confirmation · returned · closed · cancelled | Ticket card, request list |
| `Chip` | `tone` | `suggest` ("Suggested", "AI") · `neutral` | Fields, table rows, banners |
| `InlineError` | `id`, `children` | icon + signal text | Field errors, sign-in error |
| `Notice` | `icon`, `tone`, `children` | `info` (graphite) · `ai` (dashed outline + AI chip, with actions) | Sign-in footer note, AI banner |
| `Card` | `title`, `number`, `status`, `children` | section card (white, line border, 14px radius) | Form sections, components |
| `Avatar` | `name` | initials on sand (top bar) or ink | Top bar, audit log |
| `Logo` | `size` | white wordmark — only on ink surfaces | Brand panel, top bar |

## Layout components (`components/layout/`)

| Component | Description | Used in |
| --- | --- | --- |
| `AuthLayout` | Split screen: `BrandPanel` (left, 620px, ink) + content area (sand). Stacks vertically on mobile. | Sign-in, device verification |
| `BrandPanel` | Logo, eyebrow, "Laine *onboarding* rights" title, signal rule, tagline, Prepare/Execute/Confirm steps. `compact` prop for mobile header. | `AuthLayout` |
| `AppShell` | `TopBar` + three-column body: left rail, main content, optional right panel | All signed-in pages |
| `TopBar` | Logo, app name, main nav (active item = white + signal underline), user block, sign-out `IconButton`. Nav items filtered by role (Admin only for admins). | `AppShell` |

## Request form (`components/request/`)

| Component | Props | Notes |
| --- | --- | --- |
| `RequestHeader` | `request`, `onSave`, `onReviewAndSign` | Eyebrow (type), employee name as title, created/saved meta, Save draft + Review & sign buttons |
| `SectionNav` | `sections[]` with `state` | States: `complete` · `current` · `suggested` · `not_started` · `locked` (other role; shows who) · `not_applicable` (e.g. SLA on onboarding) |
| `FormSection` | `number`, `title`, `summary`, `children` | `Card` wrapper; summary right-aligned ("Complete", "1 required field missing" in signal) |
| `FieldRenderer` | `field` (from the versioned form schema), `value`, `suggestion`, `error` | Renders the right field type from schema — this is what makes admin-added fields (e.g. Country) appear without code changes |
| `SuggestedField` | `field`, `suggestion`, `onAccept`, `onReject`, `onEdit` | Dashed ink outline + "Suggested" chip + accept (✓) / reject (✕) `IconButton`s. Editing the value counts as accepting the edited value. |
| `AccessMatrix` | `items[]`, `catalog`, `onAdd`, `onApplyTemplate` | Two columns of category groups; compact rows: app · Action select · Permission select; notes open per row. Actions and permissions come from each catalog app (Hexnode: Enroll/Remove) |
| `EquipmentTable` | `items[]` | Section 6 |
| `PhysicalAccessTable` | `items[]` | Section 7 |
| `AiSuggestionBanner` | `count`, `onAcceptAll`, `onDismiss` | `Notice` variant `ai` |

## Requests list (`components/requests/`)

| Component | Props | Notes |
| --- | --- | --- |
| `SummaryTile` | `label`, `value` | White card, Newsreader number |
| `SearchField` | `placeholder`, `value`, `onChange` | Pill input with search icon |
| `RequestTable` | `rows[]`, `onOpen`, pagination | Whole row is a link; SLA countdown in signal under Effective date |

## Assistant (`components/assistant/`)

| Component | Props | Notes |
| --- | --- | --- |
| `AssistantPanel` | `requestId`, `mode` | Header + mode `SegmentedControl` (This request / Batch onboarding) + message list + composer |
| `ChatMessage` | `role`, `parts` | User = black bubble right-aligned; assistant = plain text with "Assistant" eyebrow |
| `SuggestionCard` | `suggestions[]`, `onAcceptAll`, `onReview` | Sand card with field → value grid |
| `ChatComposer` | `onSend`, `onAttach` | Textarea (visually hidden label), attach CSV/XLSX, send button, guardrail note |

## Sign-in (`components/auth/`)

| Component | Notes |
| --- | --- |
| `SignInForm` | Custom form on Clerk's `useSignIn()` (Core 3): `signIn.password({ emailAddress, password })`, then `signIn.finalize({ navigate })`. Field errors from `errors.fields.identifier` / `errors.fields.password`; submit disabled while `fetchStatus === 'fetching'`. Uses `TextField`, `PasswordField`, `Button`, `InlineError`, `Notice`. |
| `VerifyDeviceForm` | Shown when `signIn.status === 'needs_client_trust'`: email code via `signIn.mfa.sendEmailCode()` / `signIn.mfa.verifyEmailCode({ code })`. To design. |
