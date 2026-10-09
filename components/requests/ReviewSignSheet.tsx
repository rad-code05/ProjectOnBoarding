"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  loadSigningReview,
  signRequest,
} from "@/app/(app)/requests/signing-actions";
import {
  AlertIcon,
  Button,
  CheckIcon,
  InlineError,
  Sheet,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ChecklistItem } from "@/lib/requests/execution";
import { formatDay, formatTime } from "@/lib/requests/format";
import {
  accessRows,
  employeeRows,
  pdfFileName,
  signButtonLabel,
  signingChecks,
  snapshotSchema,
  type Check,
  type Row,
  type SigningReview,
} from "@/lib/requests/signing";

const card = "flex flex-col gap-2.5 rounded-xl border border-line px-3.5 py-3";
const cardTitle = "font-serif text-[19px]";

function Rows({ rows, split = false }: { rows: Row[]; split?: boolean }) {
  return (
    <dl
      className={cn(
        "grid gap-x-3.5 gap-y-1.5 text-[13px]",
        split ? "grid-cols-[1fr_auto]" : "grid-cols-[auto_1fr]",
      )}
    >
      {rows.map((row, i) => (
        <div key={`${row.label}-${i}`} className="contents">
          <dt className={split ? "font-semibold" : "text-graphite"}>
            {row.label}
          </dt>
          <dd className={split ? "text-right text-graphite" : "font-semibold"}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Raju's Review & sign (design: Review & sign dialog + Phone · Review & sign).
 * Shows exactly the snapshot the database will sign, the blocking checks and
 * the signature; signing sends that snapshot back and the database checks it.
 */
export function ReviewSignSheet({
  requestId,
  eyebrow,
  checklist,
  onEdit,
  onClose,
}: {
  requestId: string;
  eyebrow: string;
  checklist: ChecklistItem[];
  /** Close and open a section of the form. */
  onEdit: (section: number) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [review, setReview] = useState<SigningReview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signing, start] = useTransition();

  // Loads (again) what is about to be signed; state is set only when it arrives.
  const load = useCallback(
    () =>
      loadSigningReview(requestId).then((result) => {
        if (result.ok) setReview(result.review);
        else setLoadError(result.message);
      }),
    [requestId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const reviewAgain = () => {
    setReview(null);
    setLoadError(null);
    setError(null);
    setConfirmed(false);
    void load();
  };

  const parsed = review ? snapshotSchema.safeParse(review.snapshot) : null;
  const snapshot = parsed?.success ? parsed.data : null;
  const checks = review ? signingChecks(review) : [];
  const allOk = checks.length > 0 && checks.every((c) => c.ok);
  const label = review ? signButtonLabel(review.approvers) : "Sign & send";

  const sign = () =>
    review &&
    start(async () => {
      setError(null);
      const result = await signRequest({
        requestId,
        snapshot: review.snapshot,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onClose();
      router.refresh();
    });

  const execution = snapshot?.execution;
  const started = snapshot?.request.execution_started_at;
  const approver =
    review?.approvers.length === 1 ? review.approvers[0] : "The approver";

  return (
    <Sheet
      eyebrow={eyebrow}
      title="Review & sign"
      onClose={onClose}
      wide
      footer={
        <div className="grid grid-cols-[1fr_1.4fr] gap-2 md:flex md:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Back to edit
          </Button>
          <Button
            disabled={!allOk || !confirmed || !snapshot}
            loading={signing}
            onClick={sign}
          >
            {label}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-normal text-graphite">
        Check everything below. Signing records your signature with the server
        date and time, locks sections 1–9 and sends the request for final
        confirmation.
      </p>

      {!review && !loadError && (
        <p role="status" className="text-sm text-graphite">
          Loading what you&apos;re about to sign…
        </p>
      )}
      {loadError && <InlineError live>{loadError}</InlineError>}

      {review && snapshot && (
        <>
          <ul
            aria-label="Checks before signing"
            className="flex flex-col gap-2.5 rounded-xl bg-sand px-3.5 py-3 text-sm"
          >
            {checks.map((check) => (
              <li key={check.label} className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex size-4.5 shrink-0 items-center justify-center rounded-pill",
                    check.ok ? "bg-ink text-paper" : "text-signal",
                  )}
                >
                  {check.ok ? (
                    <CheckIcon size={10} strokeWidth={3.5} />
                  ) : (
                    <AlertIcon size={18} />
                  )}
                </span>
                <span
                  className={cn(
                    "flex-1",
                    !check.ok && "font-semibold text-signal",
                  )}
                >
                  {check.label}
                </span>
                <FixLink fix={check.fix} onEdit={onEdit} />
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-3.5 md:grid md:grid-cols-2">
            <section aria-labelledby="rs-employee" className={card}>
              <div className="flex items-center justify-between">
                <h3 id="rs-employee" className={cardTitle}>
                  Employee
                </h3>
                <EditButton section={2} onEdit={onEdit} />
              </div>
              <Rows rows={employeeRows(snapshot)} />
            </section>

            <section aria-labelledby="rs-access" className={card}>
              <div className="flex items-center justify-between">
                <h3 id="rs-access" className={cardTitle}>
                  Access &amp; equipment
                </h3>
                <EditButton section={5} onEdit={onEdit} />
              </div>
              {accessRows(snapshot).length > 0 ? (
                <Rows rows={accessRows(snapshot)} split />
              ) : (
                <p className="text-[13px] text-graphite">Nothing requested.</p>
              )}
            </section>
          </div>

          <section aria-labelledby="rs-it" className={card}>
            <div className="flex items-center justify-between">
              <h3 id="rs-it" className={cardTitle}>
                9 · IT execution
              </h3>
              <EditButton section={9} onEdit={onEdit} />
            </div>
            <span className="-mt-1.5 text-xs text-graphite">
              Executed by {execution?.executed_by_name ?? "—"}
              {started
                ? ` · started ${formatDay(started)}, ${formatTime(started)}`
                : ""}
            </span>
            <ul className="flex flex-col gap-2 text-[13px]">
              {checklist.map((item) => {
                const done = Boolean(execution?.checks[item.key]);
                return (
                  <li key={item.key} className="flex items-start gap-2">
                    {done ? (
                      <CheckIcon size={16} className="mt-px shrink-0" />
                    ) : (
                      <AlertIcon
                        size={16}
                        className="mt-px shrink-0 text-signal"
                      />
                    )}
                    <span className={cn(!done && "text-signal")}>
                      {item.label}
                      {!done && " — not ticked"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-[13px] text-graphite">
              <span className="font-semibold text-ink">Notes: </span>
              {execution?.notes || "—"}
            </p>
          </section>

          <section
            aria-labelledby="rs-sig"
            className="flex flex-col gap-2.5 rounded-xl border-2 border-ink px-3.5 py-3"
          >
            <div className="flex items-center justify-between">
              <h3 id="rs-sig" className={cardTitle}>
                Your signature
              </h3>
              <Link href="/profile" className={linkStyle}>
                Change in My profile
              </Link>
            </div>
            <div className="flex h-19 items-center justify-center rounded-field bg-sand">
              {review.signature?.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived private link
                <img
                  src={review.signature.previewUrl}
                  alt="Your active signature"
                  className="max-h-16 max-w-full object-contain"
                />
              ) : review.signature?.typedText ? (
                <span className="font-accent text-[34px] italic">
                  {review.signature.typedText}
                </span>
              ) : (
                <span className="text-sm text-graphite">No signature yet</span>
              )}
            </div>
            {review.signature && (
              <span className="text-xs text-graphite">
                Active {review.signature.kind} · {review.signature.detail}
              </span>
            )}
            <div className="h-px bg-line-subtle" />
            <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
              Will be recorded as
            </span>
            <Rows
              rows={[
                { label: "Signer", value: review.signerName },
                { label: "Role", value: "IT execution owner" },
                { label: "Section", value: "9 · IT execution" },
                {
                  label: "Date/time",
                  value: "Set by the server when you sign",
                },
                {
                  label: "Form",
                  value: `Version ${snapshot.request.form_version}`,
                },
              ]}
            />
          </section>

          <label className="flex items-start gap-3 rounded-xl bg-sand px-3.5 py-3 text-sm leading-snug">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-ink"
            />
            I confirm the details above are correct and the IT work was carried
            out as recorded.
          </label>

          <p className="text-xs leading-normal text-graphite">
            Next: {approver} confirms and signs. The PDF{" "}
            <strong className="text-ink">
              {pdfFileName(
                snapshot.request.first_name,
                snapshot.request.last_name,
                snapshot.request.type,
              )}
            </strong>{" "}
            is created when the request closes.
          </p>

          {error && (
            <div className="flex flex-col gap-2">
              <InlineError live>{error}</InlineError>
              {error.includes("review it again") && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  onClick={reviewAgain}
                >
                  Review again
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

const linkStyle = "text-[13px] font-semibold underline underline-offset-2";

/** "Fix" next to a failing check: opens the section, or My profile. */
function FixLink({
  fix,
  onEdit,
}: {
  fix: Check["fix"];
  onEdit: (section: number) => void;
}) {
  if (!fix) return null;
  if ("href" in fix) {
    return (
      <Link href={fix.href} className={linkStyle}>
        Fix
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onEdit(fix.section)}
      className={linkStyle}
    >
      Fix
    </button>
  );
}

function EditButton({
  section,
  onEdit,
}: {
  section: number;
  onEdit: (section: number) => void;
}) {
  return (
    <button type="button" onClick={() => onEdit(section)} className={linkStyle}>
      Edit
    </button>
  );
}
