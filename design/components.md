# Reusable components

Every screen is composed from these components. Each maps to one React component in `components/` (UI primitives in `components/ui/`, app-specific pieces in `components/<area>/`). Visual reference: the **Components** board on the design canvas.

Rules:
- Components take data and callbacks through props; they never fetch data or check permissions themselves (pages and Server Actions do).
- Styling uses only the tokens in [tokens.md](tokens.md) — no raw hex values in components.
- Every interactive component is keyboard-accessible and labelled.

## UI primitives (`components/ui/`)

**Built in S3:** Button, IconButton, TextField (+ `fieldSize`, `endAdornment`, `labelAside`), PasswordField, InlineError, Notice (`info`/`ai`), Logo, Avatar (+ `initials()`), icons (Lock, Alert, Eye, EyeOff, SignOut, Plus). Preview at `/dev/ui` (dev only). The rest are built by the step/feature that first needs them.

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

## Shared components already built on the canvas
`TopBar` (props: `role` admin/approver, `active`, `userName`, `userRole`, `initials` — nav items change by role), `BrandPanel`, `AdminNav` (`active`). Newer boards import them with `<dc-import>`; the app will have the same components.

## Admin, profile & audit (`components/admin/`, `components/profile/`)

| Component | Notes |
| --- | --- |
| `AdminNav` | Left sub-menu: Users & roles, Applications, Form fields, Templates & defaults |
| `UserTable`, `InviteForm` | Roles as chips; invite with role checkboxes; role rules panel |
| `CatalogEditor`, `AppEditPanel` | Category tabs, app rows, edit panel with actions + permission-option chip input, Retire |
| `FieldTable`, `FieldSuggestionCard`, `VersionHistory` | Draft vs published versions; AI suggestions to review |
| `TemplateTable`, `SettingsSection` | RBAC templates; defaults, SLA, PDF & SharePoint |
| `SignatureSlot`, `SignatureHistory` | Upload/replace PNG, active marker, version history |
| `AuditTable`, `SourceChip` | Source: People / AI / System |

## Request variants (`components/request/`)
`SlaPanel` (countdown, timeline, deadline), `InventoryBanner`, `RemovalTable`, `HandoverSection`, `ReturnedNotice`, `ReadOnlySectionCard`, `BatchGrid` (per-row check status).

## Records & states
`PdfDocument` (react-pdf; `PdfSectionTable`, `PdfSignatureBlock`, `PdfFooter`), `EmptyState` (with `RobotAvatar`), `ErrorPage` (403/404), `Skeleton`, `ConflictAlert`, `OfflineBanner`, `EmailLayout` (phase 2).

## Layout components (`components/layout/`)

| Component | Description | Used in |
| --- | --- | --- |
| `AuthLayout` | Split screen: `BrandPanel` (left, 620px, ink) + content area (sand). Stacks vertically on mobile. | Sign-in, device verification |
| `BrandPanel` | Logo, eyebrow, "Laine *onboarding* rights" title, signal rule, tagline, Prepare/Execute/Confirm steps. `compact` prop for mobile header. | `AuthLayout` |
| `AppShell` | `TopBar` + three-column body: left rail, main content, optional right panel | All signed-in pages |
| `TopBar` | Logo, app name, main nav (active item = white + signal underline), user block, sign-out `IconButton`. Nav items filtered by role (Admin only for admins). | `AppShell` |

## Request form (`components/request/`)

**Built in F01d (in `components/requests/`):** `RequestForm` (header with ticket bar, ticket-type switch from the `type` field, sections 1–2, Save draft with version check; on a phone the buttons sit in a sticky bottom bar), `FieldRenderer` (field types `text` · `email` · `date` · `select` · `department` · `country` · `user` · `system`; 48 px / 16 px fields on phones so iPhone doesn't zoom, 36 px / 13 px on desktop; `phoneSpan()` puts text fields full width and lists/dates/names two per row), `NewRequestButton` (submit button of the create-draft form — a POST, so no draft is ever created by a link prefetch). **F01d-3:** `useAutosave` (saves 1.5 s after the last change, one at a time, stops after a conflict), `ChangedElsewhere` (conflict box), `SectionNav` (phone chips / desktop rail; states complete · to fill · locked · not started), `CollapsedSection` (sections 3–11 as rows; locked rows say who/when). **F02b:** `ProvisioningSection` (section 4, Custom / exception until D17), `AccessSection` (section 5 — phone list + desktop two-column grid from the catalog, search, All / Set filter, saves each choice at once with undo on refusal, "Saving…" status), `AppDialog` (edit one app: action / permission / notes / Clear; native `<dialog>`, bottom sheet on phones). **F02c:** "Other" group + **Add other application** in `AccessSection`; `AppDialog` with `nameEditable` and free-text permission. **F03b:** `Sheet` (shared bottom sheet / centred window — native `<dialog>`, now also used by `AppDialog`, which gained `permissionLabel`), `EquipmentSection` + its add/change sheet (section 6), `PhysicalSection` (section 7, reuses `AppDialog` with "Scope"). **F04b:** `ExecutionSection` (section 9 checklist + notes + system-set executed by / started), `StartExecutionSheet` and `CancelRequestSheet` (`WorkflowSheets.tsx`, both on `Sheet`), cancelled / returned notes at the top of the form. **F07b (`components/approvals/`):** `ApprovalView`, `ConfirmSignSheet`, `ReturnSheet`; `SnapshotCards` (+ `Rows`, `SignatureMark`) shared by Review & sign and the approver. **F06:** `ReviewSignSheet` (checks with Fix, summary cards with Edit, signature + "will be recorded as", confirm tick) and `SignaturesSection` (section 11); `Sheet` gained `wide` and a sticky `footer`. **F05b (`components/profile/`):** `SignaturePanel` (Sign with cards, typed initials, history) and `UploadSignatureSheet` (PNG pick + preview + browser-side checks, on `Sheet`). **F05c:** `ChangePasswordCard`, `MfaCards` (Authenticator app On/Off + Backup codes), `NewPhoneSheet`, `NewBackupCodesSheet`, **F05d:** `SignaturePad` (canvas for finger / stylus / mouse, `toPng()`), `UploadSignatureSheet` now with a Draw / Upload PNG switch, and **`ReverifySheet` + `useReverifyPrompt`** — our own "Confirm it's you" for any Clerk action that needs reverification (pass `onNeeds` to `useReverification`). Still to build: `SuggestedField` (F15).

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

## Review & sign (`components/signing/`)

| Component | Props | Notes |
| --- | --- | --- |
| `Dialog` | `title`, `eyebrow`, `description`, `onClose`, `footer` | Modal, 780px, 18px radius, dim backdrop; focus trap; Esc closes (UI primitive — lives in `components/ui/`) |
| `CheckRow` | `ok`, `label`, `fixHref` | Black check when passing; signal text + link when failing |
| `SummaryCard` | `title`, `rows[]`, `onEdit` | Read-only label/value grid with Edit link |
| `SignatureBlock` | `signatureUrl`, `signer`, `role`, `section`, `formVersion` | Signature image preview + "will be recorded as"; no editable date |
| `Checkbox` | `label`, `checked`, `required` | Native checkbox, ink accent color (UI primitive) |

## Records & export (`components/records/`)

| Component | Props | Notes |
| --- | --- | --- |
| `PdfRecordCard` | `filename`, `formVersion`, `generatedAt`, `hash`, `onDownload`, `onSaveToSharePoint`, `onPreview` | Black-outlined card with PDF icon and actions |
| `SharePointStatus` | `status` (`not_saved` · `saving` · `saved` · `failed`), `path`, `savedBy`, `savedAt`, `url` | Sand strip under the actions; failed state in signal with Retry |
| `ActivityList` | `events[]` | Compact audit timeline |
| `Toast` | `message`, `tone` | Black pill toast, `role="status"` (UI primitive) |

## Reports (`components/reports/`)

| Component | Props | Notes |
| --- | --- | --- |
| `ReportNav` | `groups[]` of `{ id, name, description }`, `selected`, `onSelect` | Left side panel; selected item outlined in ink |
| `ReportHeader` | `title`, `definition`, `onExportCsv`, `onExportPdf` | Definition line is mandatory for every report |
| `FilterBar` | `period`, `filters[]` | One row: period segmented control + selects |
| `StatTile` | `label`, `value` | White tile, Newsreader number |
| `BarChart` | `data[]`, `max`, `formatReadout` | Vertical single-series bars, ink, 4px data ends, hover readout |
| `HBarChart` | `data[]` | Horizontal bars with value label at the end |
| `DataTable` | `columns[]`, `rows[]`, `footer` | Also the source for CSV export |

## Requests list (`components/requests/`)

| Component | Props | Notes |
| --- | --- | --- |
| `SummaryTile` | `label`, `value` | White card, Newsreader number |
| `SearchField` | `placeholder`, `value`, `onChange` | Pill input with search icon |
| `RequestTable` | `rows[]`, `onOpen`, pagination | Whole row is a link; SLA countdown in signal under Effective date |

## Assistant (`components/assistant/`)

| Component | Props | Notes |
| --- | --- | --- |
| `AssistantLauncher` | `pendingCount`, `state`, `onOpen` | Floating 68px robot button bottom-right; badge when `pendingCount > 0`; optional greeting bubble |
| `RobotAvatar` | `size`, `expression` (`idle` · `happy` · `thinking`) | Inline SVG Laine robot, reused in launcher and panel header |
| `AssistantPanel` | `requestId`, `mode`, `open`, `onClose` | Closed by default. Header (robot avatar, "Laine assistant", close) + mode `SegmentedControl` + message list + composer |
| `ChatMessage` | `role`, `parts` | User = black bubble right-aligned; assistant = plain text with "Assistant" eyebrow |
| `SuggestionCard` | `suggestions[]`, `onAcceptAll`, `onReview` | Sand card with field → value grid |
| `ChatComposer` | `onSend`, `onAttach` | Textarea (visually hidden label), attach CSV/XLSX, send button, guardrail note |

## Sign-in (`components/auth/`)

**Built in S5:** `AuthLayout` + `AuthHeading`, `BrandPanel` + `BrandHeader` (mobile), `SignInForm`, `TotpStep` + `DeviceCodeStep` (`CodeSteps.tsx`), `ResetPasswordForm`, `SessionTasks` + `SetupMfa` (since F05c built from the shared `AuthenticatorQr` + `BackupCodeList` in `MfaPieces.tsx`, also used by My profile → Password & MFA), `SignOutButton`, `useFinishSignIn`, `authErrorMessage` (`authErrors.ts`). `TextField` gained `inputClassName`. Server helper `requireUser()` in `lib/auth.ts`.

| Component | Notes |
| --- | --- |
| `SignInForm` | Custom form on Clerk's `useSignIn()` (Core 3): `signIn.password({ emailAddress, password })`, then `signIn.finalize({ navigate })`. Field errors from `errors.fields.identifier` / `errors.fields.password`; submit disabled while `fetchStatus === 'fetching'`. Uses `TextField`, `PasswordField`, `Button`, `InlineError`, `Notice`. |
| `VerifyDeviceForm` | Shown when `signIn.status === 'needs_client_trust'`: email code via `signIn.mfa.sendEmailCode()` / `signIn.mfa.verifyEmailCode({ code })`. To design. |
