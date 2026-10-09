"use client";

import Link from "next/link";
import { useState } from "react";
import { SnapshotCards } from "@/components/requests/SnapshotCards";
import { SignaturesSection } from "@/components/requests/SignaturesSection";
import {
  Button,
  ChevronLeftIcon,
  InlineError,
  StatusPill,
} from "@/components/ui";
import type { ApprovalReview, AppliedSignature } from "@/lib/approvals/review";
import { TYPE_LABELS, personName } from "@/lib/requests/labels";
import { snapshotSchema, type SignedSection } from "@/lib/requests/signing";
import { ConfirmSignSheet } from "./ConfirmSignSheet";
import { ReturnSheet } from "./ReturnSheet";

const toSigned = (
  section: SignedSection["section"],
  s: AppliedSignature | null,
): SignedSection[] =>
  s
    ? [
        {
          section,
          signerName: s.name,
          signedLabel: s.signedLabel,
          fingerprint: s.fingerprint,
        },
      ]
    : [];

/**
 * A request as the approver sees it: read-only, from the snapshot they would
 * confirm. While it awaits confirmation: Return to Raju / Confirm & sign.
 */
export function ApprovalView({
  review,
  signerName,
}: {
  review: ApprovalReview;
  signerName: string;
}) {
  const [sheet, setSheet] = useState<"confirm" | "return" | null>(null);
  const parsed = snapshotSchema.safeParse(review.snapshot);
  if (!parsed.success) {
    return <InlineError>This request could not be shown.</InlineError>;
  }
  const snapshot = parsed.data;
  const name =
    personName(snapshot.request.first_name, snapshot.request.last_name) ||
    "Unnamed person";
  const waiting = review.state === "pending_confirmation";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3.5 pb-24 md:pb-0">
      <div className="flex items-center gap-2">
        <Link
          href="/approvals"
          className="-ml-2 flex h-11 items-center gap-1 px-2 text-sm font-semibold"
        >
          <ChevronLeftIcon size={18} />
          Approvals
        </Link>
        <span className="flex-1" />
        <span className="text-[13px] font-bold">{review.ticketId}</span>
        <StatusPill state={review.state} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
          Request · {TYPE_LABELS[review.type]}
          {waiting ? " · Awaiting your confirmation" : ""}
        </span>
        <h1 className="font-serif text-[32px] leading-tight">{name}</h1>
      </div>

      <SnapshotCards
        snapshot={snapshot}
        checklist={review.checklist}
        idPrefix="ap"
      />
      <SignaturesSection
        signatures={[
          ...toSigned("it_execution", review.it),
          ...toSigned("final_confirmation", review.approval),
        ]}
        state={review.state}
      />

      {waiting && (
        <div
          data-sticky-bar
          className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-[1fr_1.4fr] gap-2 border-t border-line bg-sand px-4 pt-3 pb-5 md:static md:flex md:justify-end md:border-0 md:bg-transparent md:p-0"
        >
          <Button
            variant="destructive"
            aria-haspopup="dialog"
            onClick={() => setSheet("return")}
          >
            Return to Raju
          </Button>
          <Button aria-haspopup="dialog" onClick={() => setSheet("confirm")}>
            Confirm &amp; sign
          </Button>
        </div>
      )}

      {sheet === "confirm" && (
        <ConfirmSignSheet
          review={review}
          snapshot={snapshot}
          signerName={signerName}
          onReturn={() => setSheet("return")}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "return" && (
        <ReturnSheet
          requestId={review.id}
          eyebrow={`${name} · ${review.ticketId}`}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
