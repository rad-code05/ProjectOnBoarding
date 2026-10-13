import Link from "next/link";
import type { ReactNode } from "react";
import {
  ExecutionCard,
  Rows,
  SignatureMark,
} from "@/components/requests/SnapshotCards";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  StatusPill,
  buttonStyles,
} from "@/components/ui";
import type { AppliedSignature } from "@/lib/approvals/review";
import { cn } from "@/lib/cn";
import type { RecordPage } from "@/lib/records/page";
import { TYPE_LABELS, personName } from "@/lib/requests/labels";
import {
  accessRows,
  employeeRows,
  offboardingRows,
} from "@/lib/requests/signing";

/**
 * A closed request as its read-only record (board: Phone · Closed request
 * (PDF record)): the PDF card with Download / Preview, both signatures and
 * the signed record. `justClosed` shows the "Confirmed, signed and closed"
 * message Moises sees right after confirming.
 */
export function RecordView({
  record,
  justClosed,
}: {
  record: RecordPage;
  justClosed: boolean;
}) {
  const r = record.snapshot.request;
  const name = personName(r.first_name, r.last_name) || "Unnamed person";
  const pdfUrl = `/records/${record.id}/pdf`;
  const access = accessRows(record.snapshot, record.timezone);
  const offboarding = offboardingRows(record.snapshot, record.timezone);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3.5">
      <div className="flex items-center gap-2">
        <Link
          href="/records"
          className="-ml-2 flex h-11 items-center gap-1 px-2 text-sm font-semibold"
        >
          <ChevronLeftIcon size={18} />
          Records
        </Link>
        <span className="flex-1" />
        <span className="text-[13px] font-bold">{record.ticketId}</span>
        <StatusPill state="closed" />
      </div>

      {justClosed && (
        <p
          role="status"
          className="flex items-center gap-2.5 rounded-xl bg-ink px-3.5 py-3 text-sm font-semibold text-paper"
        >
          <span className="flex size-5.5 shrink-0 items-center justify-center rounded-pill bg-paper text-ink">
            <CheckIcon size={12} strokeWidth={3.5} />
          </span>
          Confirmed, signed and closed
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
          Record · {TYPE_LABELS[record.type]}
        </span>
        <h1 className="font-serif text-[32px] leading-tight">{name}</h1>
        <p className="text-[13px] text-graphite">
          Closed {record.closedLabel} · read-only record
        </p>
      </div>

      <div className="flex flex-col gap-3.5 md:grid md:grid-cols-[1.3fr_1fr] md:items-start">
        <section
          aria-labelledby="pdf-title"
          className="flex flex-col gap-3 rounded-card border-2 border-ink bg-paper p-4"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-13 w-10.5 shrink-0 items-end justify-center rounded-[6px] bg-ink pb-2 text-[11px] font-bold tracking-[0.06em] text-paper"
            >
              PDF
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 id="pdf-title" className="font-serif text-[21px]">
                Access record
              </h2>
              <span className="text-sm font-bold break-all">
                {record.pdf?.fileName ?? "Not available yet"}
              </span>
            </div>
          </div>

          {record.pdf ? (
            <>
              <Rows
                rows={[
                  {
                    label: "Contents",
                    value: `Form v${r.form_version} · all 11 sections · both signatures`,
                  },
                  {
                    label: "Made",
                    value: `${record.pdf.generatedLabel} (${record.pdf.timezone}) from the signed snapshot`,
                  },
                  {
                    label: "Fingerprint",
                    value: `${record.pdf.sha256.slice(0, 16)}…`,
                  },
                ]}
              />
              <a
                href={pdfUrl}
                className={cn(buttonStyles("primary", "lg"), "w-full")}
              >
                <DownloadIcon size={18} />
                Download PDF
              </a>
              <a
                href={`${pdfUrl}?view=1`}
                target="_blank"
                rel="noopener"
                className={cn(buttonStyles("secondary", "md"), "w-full")}
              >
                Preview
              </a>
              <p className="text-xs leading-normal text-graphite">
                Every download is the same file, made once when the request
                closed. Downloads are recorded in the audit log.
              </p>
            </>
          ) : (
            <p role="alert" className="text-sm text-signal">
              The PDF could not be made just now. Reload this page to try again.
            </p>
          )}
        </section>

        <section
          aria-labelledby="sig-title"
          className="flex flex-col gap-1 rounded-card border border-line bg-paper p-3.5"
        >
          <h2 id="sig-title" className="pb-1 font-serif text-xl">
            Signatures
          </h2>
          <SignatureRow role="IT execution · section 9" signature={record.it} />
          <SignatureRow
            role="Approver · sections 3, 10, 11"
            signature={record.approval}
          />
        </section>
      </div>

      <section aria-labelledby="rec-title" className="flex flex-col gap-2">
        <h2 id="rec-title" className="font-serif text-xl">
          The signed record
        </h2>
        <div className="flex flex-col rounded-card border border-line bg-paper">
          <Expandable
            title="Employee"
            note={[r.job_title, r.department].filter(Boolean).join(" · ")}
          >
            <Rows rows={employeeRows(record.snapshot)} />
          </Expandable>
          <Expandable
            title="Access & equipment"
            note={`${access.length} item${access.length === 1 ? "" : "s"}`}
          >
            {access.length > 0 ? (
              <Rows rows={access} split />
            ) : (
              <p className="text-[13px] text-graphite">Nothing requested.</p>
            )}
          </Expandable>
          {offboarding.length > 0 && (
            <Expandable
              title="Access removal SLA & handover"
              note={
                offboarding.find((row) => row.label === "Removed within SLA")
                  ?.value ?? ""
              }
            >
              <Rows rows={offboarding} split />
            </Expandable>
          )}
          <Expandable
            title="IT execution and notes"
            note={record.snapshot.execution?.executed_by_name ?? "—"}
          >
            <ExecutionCard
              snapshot={record.snapshot}
              checklist={record.checklist}
              idPrefix="rec"
              timeZone={record.timezone}
            />
          </Expandable>
        </div>
      </section>

      <p className="text-xs leading-normal text-graphite">
        This record can&apos;t be changed. Names and times were set by the
        system when each person signed.
      </p>
    </div>
  );
}

function SignatureRow({
  role,
  signature,
}: {
  role: string;
  signature: AppliedSignature | null;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-line-subtle py-2.5">
      <SignatureMark
        imageUrl={signature?.imageUrl ?? null}
        typedText={signature?.typedText ?? null}
        alt={`Signature of ${signature?.name ?? "the signer"}`}
        className="h-14 w-24 shrink-0"
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[11px] font-semibold tracking-[0.12em] text-graphite uppercase">
          {role}
        </span>
        <span className="text-sm font-semibold">
          {signature?.name ?? "Not signed"}
        </span>
        {signature && (
          <span className="text-xs text-graphite">
            {signature.signedLabel} · fingerprint{" "}
            {signature.fingerprint.slice(0, 8)}…
          </span>
        )}
        {signature?.note && (
          <span className="text-xs text-graphite">
            Note: “{signature.note}”
          </span>
        )}
      </div>
    </div>
  );
}

/** One row of "The signed record" that opens in place (native <details>). */
function Expandable({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <details className="group border-b border-line-subtle last:border-b-0">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2.5 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-semibold">{title}</span>
          {note && <span className="text-xs text-graphite">{note}</span>}
        </span>
        <ChevronRightIcon
          size={18}
          className="rotate-90 transition-transform group-open:-rotate-90"
        />
      </summary>
      <div className="px-3.5 pt-1 pb-3.5">{children}</div>
    </details>
  );
}
