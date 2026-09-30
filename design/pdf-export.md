# Closed request & PDF export

**Status:** draft for review · Canvas board: *Closed request · PDF export*

Where Moises (or Raju) gets the finished record as a PDF, to keep on their computer or store in SharePoint.

## When the PDF exists

The PDF is generated **once, when Moises confirms, signs and closes** the request, from the frozen signed snapshot. Every download is the same file. Draft/in-progress requests have no official PDF (a watermarked "DRAFT – NOT APPROVED" preview may be added later if wanted).

## Where the export options are

1. **Right after closing** — Moises lands on the closed request page with the toast "Confirmed, signed and closed" and the export card on top.
2. **Closed request page** (any time later, from the requests list) — the **Access record ready** card:
   - file name, e.g. `anna.keller-onboarding.pdf` (see naming rules in `PROJECT_PLAN.md` §8.2);
   - form version, "all 11 sections · both signatures", generation time, SHA-256 fingerprint;
   - **Download PDF** (primary) — saves to the computer;
   - **Save to SharePoint** (secondary) — uploads to the agreed document library; then shows "Saved to SharePoint · [Site] › IT › Access records › 2026", who saved it and when, and **Open in SharePoint**;
   - **Preview** — opens the PDF in the browser.
3. **Requests list** — closed rows show a **PDF** download marker in the last column.

Side cards: **Signatures** (Raju and Moises with server timestamps) and **Recent activity** (from the audit log, including downloads and SharePoint saves).

## Who can export
Admin, approver/reviewer and auditor roles. Every download and SharePoint save writes an audit event.

## SharePoint integration (decision needed)

| Option | How | Effort / setup |
| --- | --- | --- |
| **A. Download only (v1 baseline)** | User downloads and drags the file into SharePoint (or a OneDrive-synced SharePoint folder). | None |
| **B. Save to SharePoint button (recommended for v1.1)** | Server uploads the PDF with Microsoft Graph: `PUT /sites/{site-id}/drive/items/{parent-id}:/{filename}:/content` (single request, files up to 250 MB). App-only auth via a Microsoft Entra app registration with **`Sites.Selected`** (admin consent) plus a `write` permission granted on **only** the chosen site — the app cannot touch any other SharePoint site. | Microsoft 365 admin creates the app registration and grants site access; we store tenant ID, client ID and secret/certificate in Vercel env settings. |
| C. Automatic save on close | Same as B, but runs automatically when a request closes; button becomes "Saved ✓". | Same as B |

Verified against Microsoft Graph docs via Context7 (2026-09-30). Folder structure proposal: `IT / Access records / <year> / <ticket-id> - <filename>`.

Needed from Laine to build B/C: SharePoint site URL and library/folder, and someone with Microsoft 365 admin rights to create the app registration and grant `Sites.Selected` access.

## Components used
`PdfRecordCard` (new), `SharePointStatus` (new), `ActivityList` (new), `Toast` (new), `StatusPill`, `Button`.
