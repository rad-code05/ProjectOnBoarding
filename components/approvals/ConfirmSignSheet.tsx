"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmRequest } from "@/app/(app)/approvals/actions";
import {
  Rows,
  SignatureMark,
  SnapshotCards,
  card,
  cardTitle,
  linkStyle,
} from "@/components/requests/SnapshotCards";
import { Button, InlineError, Sheet } from "@/components/ui";
import type { ApprovalReview } from "@/lib/approvals/review";
import { pdfFileName, type Snapshot } from "@/lib/requests/signing";

/**
 * Moises's Confirm & sign (design: Moises · Confirm & sign + Phone · Confirm
 * & sign). Confirming sends back the snapshot shown; the database checks it.
 */
export function ConfirmSignSheet({
  review,
  snapshot,
  signerName,
  onReturn,
  onClose,
}: {
  review: ApprovalReview;
  snapshot: Snapshot;
  signerName: string;
  /** Switch to "Return to Raju". */
  onReturn: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const blocked = review.ownRequest || !review.mine;

  const confirm = () =>
    start(async () => {
      setError(null);
      const result = await confirmRequest({
        requestId: review.id,
        snapshot: review.snapshot,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push("/approvals");
      router.refresh();
    });

  return (
    <Sheet
      eyebrow={`${review.ticketId} · Awaiting your confirmation`}
      title="Confirm & sign"
      onClose={onClose}
      wide
      footer={
        <div className="grid grid-cols-[1fr_1.4fr] gap-2 md:flex md:justify-end">
          <Button variant="destructive" onClick={onReturn}>
            Return to Raju
          </Button>
          <Button
            disabled={!approved || blocked}
            loading={pending}
            onClick={confirm}
          >
            Confirm, sign &amp; close
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-normal text-graphite">
        Raju has completed and signed this request. Confirm to approve the
        access record, apply your signature and close it.
      </p>

      {review.it?.note && (
        <div className="flex flex-col gap-1 rounded-xl bg-sand px-3.5 py-3">
          <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
            Note from {review.it.name} · sent again {review.it.signedLabel}
          </span>
          <p className="text-sm leading-snug">{review.it.note}</p>
        </div>
      )}

      <SnapshotCards
        snapshot={snapshot}
        checklist={review.checklist}
        idPrefix="cs"
      />
      <button
        type="button"
        onClick={onClose}
        className={`${linkStyle} self-start`}
      >
        View the full form (read-only)
      </button>

      {review.it && (
        <section aria-labelledby="cs-it-signed" className={card}>
          <h3 id="cs-it-signed" className={cardTitle}>
            IT execution · signed
          </h3>
          <SignatureMark
            imageUrl={review.it.imageUrl}
            typedText={review.it.typedText}
            alt={`Signature of ${review.it.name}`}
            className="h-15"
          />
          <span className="text-[13px]">
            <strong>{review.it.name}</strong> · IT execution owner
          </span>
          <span className="text-xs text-graphite">
            Signed {review.it.signedLabel}
          </span>
          <span
            className="font-mono text-xs break-all text-graphite"
            title="SHA-256 of what was signed"
          >
            Fingerprint {review.it.fingerprint.slice(0, 16)}…
          </span>
        </section>
      )}

      <section
        aria-labelledby="cs-mine"
        className="flex flex-col gap-2.5 rounded-xl border-2 border-ink px-3.5 py-3"
      >
        <div className="flex items-center justify-between">
          <h3 id="cs-mine" className={cardTitle}>
            Your signature
          </h3>
          <Link href="/profile" className={linkStyle}>
            Change in My profile
          </Link>
        </div>
        <SignatureMark
          imageUrl={review.mine?.previewUrl ?? null}
          typedText={review.mine?.typedText ?? null}
          alt="Your active signature"
        />
        <Rows
          rows={[
            { label: "Signer", value: signerName },
            { label: "Role", value: "Approver · sections 3, 10, 11" },
            { label: "Date/time", value: "Set by the server when you sign" },
          ]}
        />
      </section>

      {!review.mine && (
        <InlineError>
          Add your signature or initials in My profile before you confirm.
        </InlineError>
      )}
      {review.ownRequest && (
        <InlineError>
          You prepared this request — another approver must confirm it.
        </InlineError>
      )}

      <label className="flex items-start gap-3 rounded-xl bg-sand px-3.5 py-3 text-sm leading-snug">
        <input
          type="checkbox"
          checked={approved}
          disabled={blocked}
          onChange={(e) => setApproved(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-ink"
        />
        I have reviewed this record and approve the access and equipment as
        listed.
      </label>

      <p className="text-xs leading-normal text-graphite">
        Closing creates{" "}
        <strong className="text-ink">
          {pdfFileName(
            snapshot.request.first_name,
            snapshot.request.last_name,
            snapshot.request.type,
          )}
        </strong>{" "}
        for download.
      </p>

      {error && <InlineError live>{error}</InlineError>}
    </Sheet>
  );
}
