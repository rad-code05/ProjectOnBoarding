"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  startAccessChange,
  startOffboarding,
} from "@/app/(app)/requests/actions";
import { attachSignedPdf } from "@/app/(app)/records/imported-actions";
import {
  Button,
  ChevronLeftIcon,
  InlineError,
  Sheet,
  buttonStyles,
} from "@/components/ui";
import type { ImportedRecord } from "@/lib/records/imported";
import { TYPE_LABELS } from "@/lib/requests/labels";

/** Access rows shown before "Show all". */
const FIRST = 8;

const FORM: Record<string, string> = {
  onboarding: "onboarding form",
  offboarding: "offboarding form",
};

/**
 * An Imported record (F24d, board *Phone · An imported person*): read-only,
 * a red note that the signed form is on SharePoint (never signed in the
 * app), the person, what they held, and — for people still working here —
 * a new access change or offboarding (admin / requester).
 */
export function ImportedRecordView({
  record,
  canStart,
  canAttach,
}: {
  record: ImportedRecord;
  /** Admin + requester: a new access change / offboarding. */
  canStart: boolean;
  /** Admin: attach or replace the original signed PDF (F24d-2). */
  canAttach: boolean;
}) {
  const [attaching, setAttaching] = useState(false);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const access = all ? record.access : record.access.slice(0, FIRST);
  const form = FORM[record.type] ?? "signed form";

  async function start(kind: "change" | "offboarding") {
    if (!record.employeeId) return;
    setBusy(kind);
    setError(null);
    // On success the action moves to the new draft; only a refusal returns.
    const r =
      kind === "change"
        ? await startAccessChange({ employeeId: record.employeeId })
        : await startOffboarding({ employeeId: record.employeeId });
    setBusy(null);
    setError(r.message);
  }

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
        <span className="rounded-pill border border-ink px-2.5 py-0.5 text-[11px] font-semibold">
          Imported
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
          {record.ticketId} · {TYPE_LABELS[record.type]} · imported
        </span>
        <h1 className="font-serif text-[32px] leading-tight break-words">
          {record.name}
        </h1>
        {record.headline && (
          <span className="text-[13px] text-graphite">{record.headline}</span>
        )}
      </div>

      {record.document ? (
        <div
          role="note"
          aria-label="Imported record"
          className="flex flex-col gap-2 rounded-card border border-line bg-paper px-3.5 py-3"
        >
          <strong className="text-sm">
            Imported record — original signed form attached
          </strong>
          <span className="text-[13px] leading-normal break-words text-graphite">
            {record.document.fileName} · {record.document.line}
          </span>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/records/${record.id}/original`}
              className={buttonStyles("primary", "sm")}
            >
              Download
            </a>
            {canAttach && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setAttaching(true)}
              >
                Replace…
              </Button>
            )}
          </div>
          <span className="text-xs text-graphite">
            Imported from {record.importedFrom}; not signed in the app.
          </span>
        </div>
      ) : (
        <div
          role="note"
          aria-label="Imported record"
          className="flex flex-col gap-2 rounded-card border-[1.5px] border-signal bg-paper px-3.5 py-3"
        >
          <strong className="text-sm text-signal">
            Imported record — signed form on SharePoint
          </strong>
          <span className="text-[13px] leading-normal">
            {record.name} was{" "}
            {record.type === "offboarding" ? "offboarded" : "onboarded"} before
            this app. The signed {form} is filed in <strong>SharePoint</strong>{" "}
            — this record was imported from <em>{record.importedFrom}</em> and
            is not signed in the app.
          </span>
          {canAttach && (
            <Button
              size="sm"
              className="self-start"
              onClick={() => setAttaching(true)}
            >
              Attach the signed PDF…
            </Button>
          )}
        </div>
      )}
      {attaching && (
        <AttachSheet
          requestId={record.id}
          replacing={Boolean(record.document)}
          form={form}
          onClose={() => setAttaching(false)}
        />
      )}

      <section
        aria-labelledby="imported-employee"
        className="flex flex-col gap-1 rounded-card border border-line bg-paper p-3.5 text-[13px]"
      >
        <h2 id="imported-employee" className="mb-1 font-serif text-[21px]">
          Employee
        </h2>
        {record.rows.map((row) => (
          <div
            key={row.label}
            className="flex gap-2.5 border-t border-line-subtle py-1.5"
          >
            <span className="w-26 shrink-0 text-graphite">{row.label}</span>
            <span className="flex min-w-0 flex-col gap-0.5 break-words">
              <span>{row.value}</span>
              {row.note && (
                <span className="text-xs text-graphite">{row.note}</span>
              )}
            </span>
          </div>
        ))}
        {record.sibling && (
          <div className="flex gap-2.5 border-t border-line-subtle py-1.5">
            <span className="w-26 shrink-0 text-graphite">
              {record.sibling.type === "offboarding"
                ? "Offboarding"
                : "Onboarding"}
            </span>
            <Link
              href={`/records/${record.sibling.id}`}
              className="font-semibold underline"
            >
              {record.sibling.ticketId}
            </Link>
          </div>
        )}
      </section>

      <section
        aria-labelledby="imported-access"
        className="flex flex-col gap-1 rounded-card border border-line bg-paper p-3.5 text-[13px]"
      >
        <h2 id="imported-access" className="mb-1 font-serif text-[21px]">
          {record.type === "offboarding" ? "Access ended" : "Access held"} ·{" "}
          {record.access.length}
        </h2>
        {record.access.length === 0 && (
          <span className="text-graphite">No applications in the import.</span>
        )}
        {access.map((a) => (
          <div
            key={`${a.name}:${a.permission}`}
            className="flex gap-2.5 border-t border-line-subtle py-1.5"
          >
            <span className="min-w-0 flex-1 break-words">{a.name}</span>
            <span className="text-right text-graphite">
              {[a.permission, a.detail].filter(Boolean).join(" · ")}
            </span>
          </div>
        ))}
        {!all && record.access.length > FIRST && (
          <Button
            variant="text"
            className="self-start"
            onClick={() => setAll(true)}
          >
            Show all {record.access.length}
          </Button>
        )}
      </section>

      {canStart && record.current && record.employeeId && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={busy === "change"}
              disabled={busy !== null}
              onClick={() => void start("change")}
            >
              New access change
            </Button>
            <Button
              variant="secondary"
              loading={busy === "offboarding"}
              disabled={busy !== null}
              onClick={() => void start("offboarding")}
            >
              Start an offboarding
            </Button>
          </div>
          {error && <InlineError live>{error}</InlineError>}
        </div>
      )}
    </div>
  );
}

/** Attach (or replace) the original signed PDF (sheet). */
function AttachSheet({
  requestId,
  replacing,
  form,
  onClose,
}: {
  requestId: string;
  replacing: boolean;
  form: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet
      eyebrow="Imported record"
      title={replacing ? "Replace the signed PDF" : "Attach the signed PDF"}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          {error && <InlineError live>{error}</InlineError>}
          <div className="grid grid-cols-[1fr_1.4fr] gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                if (!file) {
                  setError("Choose the signed PDF.");
                  return;
                }
                setBusy(true);
                setError(null);
                const data = new FormData();
                data.set("file", file);
                const r = await attachSignedPdf(requestId, data);
                setBusy(false);
                if (r.ok) {
                  onClose();
                  router.refresh();
                } else setError(r.message);
              }}
            >
              {replacing ? "Replace" : "Attach"}
            </Button>
          </div>
        </div>
      }
    >
      <p className="text-sm leading-normal">
        The signed {form} from SharePoint, as a PDF (up to 10 MB). It is kept
        privately with this record; everyone who reads records can download it,
        and every download is recorded.
        {replacing && " The current one is kept in the history."}
      </p>
      <input
        type="file"
        aria-label="Signed PDF"
        accept="application/pdf,.pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-[13px] file:mr-3 file:h-10 file:rounded-pill file:border file:border-ink file:bg-transparent file:px-4 file:font-semibold"
      />
    </Sheet>
  );
}
