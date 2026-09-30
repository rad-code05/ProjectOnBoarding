# Phase 3 — Signatures, PDF, audit log & reports

**Status:** Not started · **Goal:** requests are signed, closed and exported as the official PDF; activity and reports are visible.

**Depends on:** Phase 2. D3 (timezone) for reports.
**Read first:** `PROJECT_PLAN.md` §6, §8–9 · `design/review-sign.md` · `design/approver-view.md` · `design/pdf-export.md` · `design/records-states.md` · `design/reports.md` · `design/profile-admin.md` (profile + audit log)
**Verify with Context7:** Supabase Storage (private buckets, policies, signed URLs), `@react-pdf/renderer` (`renderToBuffer`, fonts, images; Next 16 config), image processing library for PNG re-encoding, charting approach (plain SVG vs library), CSV generation.

## Steps

- [ ] **3.1 My profile & signature upload** — signature and initials slots, PNG-only validation (size, dimensions), server re-encode + metadata strip, private bucket `signatures/<user_id>/…`, version history, active flag.
- [ ] **3.2 Review & sign (Raju)** — *needs 3.1.* Replaces the temporary confirm step from 2.5. Dialog with blocking checks (the AI-suggestion check is skipped until Phase 4), summary cards, signature preview (active asset), confirmation checkbox. Server: re-check role/state/version → write an immutable `request_snapshots` row (`it_signature`, RFC 8785 canonical JSON + SHA-256) → `signatures` row → lock sections 1–9 → *Awaiting confirmation* → audit event. A returned request sets `cleared_at` on the previous signature and requires this step again. Spec: `design/review-sign.md`.
- [ ] **3.3 Confirm & sign (Moises)** — dialog with Raju's signature read-only and approver signature (active asset); approve → `approval` snapshot + signature (sections 3, 10, approver half of 11) → `closure` snapshot → close → triggers 3.4. Approver can never be the request's preparer/executor. Return keeps working from 2.8. Button labels use the approver role, not a fixed name.
- [ ] **3.4 PDF generation** — `PdfDocument` (2+ A4 pages mirroring form v4, both signatures, footer with hash) rendered server-side from the `closure` snapshot (written at 3.3); stored in private bucket; filename sanitising + collision-safe storage path.
- [ ] **3.5 Records & download** — closed request page (`PdfRecordCard`, signatures, recent activity), `/records` list for approvers, authorised download route, PDF marker in lists, audit events for downloads.
- [ ] **3.6 Audit log page** — filters (person, action, source, period), before/after details, CSV export (audited).
- [ ] **3.7 Reports** — report-type side panel with the 8 reports from `design/reports.md` as SQL views/queries with documented definitions; charts (single-series bars with hover readout) + tables; CSV and PDF export (audited); approver read-only access.

## Tests
Signature integrity (snapshot hash matches PDF), cannot sign own request as approver, PDF snapshot stable across regenerations, report definitions unit-tested against fixtures.

## Exit criteria
A request goes draft → closed with both signatures; PDF downloads with the agreed filename; reports and audit log match the data.

## Session log
- (none yet)
