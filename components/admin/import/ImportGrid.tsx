"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  confirmStaffImport,
  discardImport,
  saveImportRowValues,
  setImportRowIncluded,
} from "@/app/(app)/admin/import/actions";
import { choiceOptions } from "@/components/requests/batch/LeaverPieces";
import {
  Button,
  Combobox,
  InlineError,
  Sheet,
  SummaryTile,
  TextField,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { readDay } from "@/lib/requests/batch/onboarding";
import {
  appCount,
  cardLine,
  confirmSplit,
  dayWords,
  IMPORT_STATE_WORDS,
  importCounts,
  importFieldLabel,
  importFooter,
  importRowState,
  leftOutLines,
  rowName,
  sortImportRows,
  type ImportRowState,
  type ImportViewRow,
} from "@/lib/staff-import/view";

export type ImportGridRow = ImportViewRow & {
  id: string;
  other: Record<string, string>;
};

/** Cards shown before "Show all". */
const FIRST = 40;

const day = (value?: string) => {
  const d = value ? readDay(value) : null;
  return d ? dayWords(d) : (value ?? "");
};

/**
 * The import check (F24c, boards *Phone · Import check*, *Confirm import +
 * result*): one card per person, problems first; untick to leave out; Fix
 * this row; Import N people… → Confirm → `import_staff()`, all or nothing.
 */
export function ImportGrid({
  importId,
  rows: given,
  departments,
  offices,
}: {
  importId: string;
  rows: ImportGridRow[];
  departments: string[];
  offices: string[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<ImportRowState | "all">("all");
  const [all, setAll] = useState(false);
  const [fixing, setFixing] = useState<ImportGridRow | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Include / leave out shows at once; the server's answer follows.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  const rows = given.map((r) =>
    r.id in ticked ? { ...r, included: ticked[r.id] } : r,
  );
  const counts = importCounts(rows);
  const shown = sortImportRows(rows).filter(
    (r) => filter === "all" || importRowState(r) === filter,
  );
  const visible = all ? shown : shown.slice(0, FIRST);

  async function include(row: ImportGridRow, included: boolean) {
    setBusy(row.id);
    setError(null);
    setTicked((t) => ({ ...t, [row.id]: included }));
    const r = await setImportRowIncluded(row.id, included);
    setBusy(null);
    if (!r.ok) {
      setError(r.message);
      setTicked((t) => {
        const next = { ...t };
        delete next[row.id];
        return next;
      });
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 pb-36 md:pb-0">
      <section
        aria-label="Summary"
        className="grid grid-cols-3 gap-2 md:max-w-xl"
      >
        <SummaryTile label="Ready" value={counts.ready} />
        <SummaryTile label="Need attention" value={counts.attention} />
        <SummaryTile label="Skipped" value={counts.skipped} />
      </section>

      <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
        {(
          [
            ["all", `All ${rows.length}`],
            ["attention", `Need attention ${counts.attention}`],
            ["ready", `Ready ${counts.ready}`],
            ["skipped", `Skipped ${counts.skipped}`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              "h-9 rounded-pill px-3 text-[13px] font-semibold whitespace-nowrap",
              filter === value
                ? "bg-ink text-paper"
                : "border border-field-border",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <InlineError live>{error}</InlineError>}

      <ul
        aria-label="People in this import"
        className="grid gap-2.5 md:grid-cols-2"
      >
        {visible.map((row) => (
          <Card
            key={row.id}
            row={row}
            busy={busy === row.id}
            onInclude={(v) => void include(row, v)}
            onFix={() => setFixing(row)}
          />
        ))}
      </ul>
      {!all && shown.length > FIRST && (
        <Button
          variant="text"
          className="self-start"
          onClick={() => setAll(true)}
        >
          Show all {shown.length}
        </Button>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 flex flex-col gap-2 border-t border-line-subtle bg-paper px-4 pt-3 pb-5 md:static md:rounded-card md:border">
        <span className="text-xs text-graphite">{importFooter(counts)}</span>
        <div className="grid grid-cols-[1fr_1.6fr] gap-2 md:flex md:justify-end">
          <Button variant="secondary" onClick={() => setDiscarding(true)}>
            Discard
          </Button>
          <Button
            disabled={counts.ready === 0}
            onClick={() => setConfirming(true)}
          >
            Import {counts.ready} {counts.ready === 1 ? "person" : "people"}…
          </Button>
        </div>
      </div>

      {fixing && (
        <FixImportRow
          key={fixing.id}
          row={fixing}
          departments={departments}
          offices={offices}
          onClose={() => setFixing(null)}
          onSaved={() => {
            setFixing(null);
            router.refresh();
          }}
        />
      )}
      {confirming && (
        <ConfirmImport
          importId={importId}
          rows={rows}
          onClose={() => setConfirming(false)}
        />
      )}
      {discarding && (
        <Sheet
          eyebrow="Import"
          title="Discard this import?"
          onClose={() => setDiscarding(false)}
        >
          <p className="text-sm leading-normal">
            Nobody is imported. The file stays listed under Earlier imports as
            discarded; you can upload it again any time.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setDiscarding(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const r = await discardImport(importId);
                if (r.ok) router.push("/admin/import");
                else setError(r.message);
              }}
            >
              Discard
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** One person's card: problems by cell, or a one-line summary when ready. */
function Card({
  row,
  busy,
  onInclude,
  onFix,
}: {
  row: ImportGridRow;
  busy: boolean;
  onInclude: (included: boolean) => void;
  onFix: () => void;
}) {
  const state = importRowState(row);
  const v = row.values;
  const leaver = Boolean(v.leaveDate);
  const apps = appCount(v);
  return (
    <li
      aria-label={`${rowName(row)} — ${IMPORT_STATE_WORDS[state]}`}
      className={cn(
        "flex flex-col gap-2.5 rounded-card bg-paper p-3.5",
        state === "attention"
          ? "border-[1.5px] border-signal"
          : "border border-line-subtle",
        (state === "skipped" || state === "left_out") && "opacity-85",
      )}
    >
      <div className="flex items-start gap-2.5">
        {state !== "skipped" && (
          <input
            type="checkbox"
            aria-label={`Include ${rowName(row)}`}
            checked={row.included}
            disabled={busy}
            onChange={(e) => onInclude(e.target.checked)}
            className="mt-0.5 size-5 accent-ink"
          />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <strong className="text-[15px] md:text-sm">{rowName(row)}</strong>
          <span className="text-xs break-words text-graphite">
            {state === "skipped"
              ? row.skipped
              : `Row ${row.position}${v.workEmail ? ` · ${v.workEmail}` : ""}`}
          </span>
        </span>
        {leaver && state === "ready" ? (
          <span className="rounded-pill border border-ink px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap">
            Leaver
          </span>
        ) : (
          <span
            className={cn(
              "text-[11px] font-bold whitespace-nowrap",
              state === "attention" && "text-signal",
              (state === "skipped" || state === "left_out") && "text-graphite",
            )}
          >
            {state === "ready" ? "✓ " : ""}
            {IMPORT_STATE_WORDS[state]}
          </span>
        )}
      </div>

      {state === "attention" ? (
        <dl className="flex flex-col text-[13px] md:text-xs">
          {row.problems.map((p) => (
            <div
              key={`${p.field}:${p.message}`}
              className="-mx-2 my-0.5 flex gap-2.5 rounded-[8px] border-[1.5px] border-signal px-2 py-1.5"
            >
              <dt className="w-24 shrink-0 text-graphite">
                {importFieldLabel(p.field)}
              </dt>
              <dd className="flex min-w-0 flex-col gap-0.5 break-words">
                {v[p.field] && <span>{v[p.field]}</span>}
                <span className="text-xs font-semibold text-signal">
                  {p.message}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        state !== "skipped" && (
          <span className="text-xs leading-normal text-graphite">
            {[
              cardLine(v),
              leaver
                ? `${day(v.startDate)} – ${day(v.leaveDate)}`
                : v.startDate && `since ${day(v.startDate)}`,
              `${apps} app${apps === 1 ? "" : "s"}`,
            ]
              .filter(Boolean)
              .join(" · ")}
            {leaver && state === "ready" && (
              <>
                <br />
                Imported as onboarded and offboarded — the access ends on{" "}
                {day(v.leaveDate)}.
              </>
            )}
          </span>
        )
      )}

      {state !== "skipped" && (
        <Button
          size="sm"
          variant={state === "attention" ? "primary" : "secondary"}
          className="self-start"
          onClick={onFix}
        >
          {state === "attention" ? "Fix this row" : "Details"}
        </Button>
      )}
    </li>
  );
}

const FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "workEmail", label: "Work email" },
  { key: "jobTitle", label: "Job title / role" },
  { key: "manager", label: "Manager" },
  {
    key: "startDate",
    label: "Start date",
    hint: "From your records — like 2025-01-06 or 06/01/2025.",
  },
  {
    key: "leaveDate",
    label: "Leave date",
    hint: "Only for people who already left.",
  },
  { key: "state", label: "State (US office)" },
  { key: "city", label: "City (US office)" },
  {
    key: "nationalities",
    label: "Nationality",
    hint: "Up to two, e.g. India, Italy.",
  },
  {
    key: "applications",
    label: "Applications",
    hint: "Comma between apps, the role in brackets: Slack (Regular Member), GitHub (Member).",
  },
  {
    key: "otherApplications",
    label: "Other applications",
    hint: "Tools not in the catalog, kept by name: Notion (Member).",
  },
];

/** Fix this row (sheet): the person's cells, the same lists as the form; Save checks again. */
function FixImportRow({
  row,
  departments,
  offices,
  onClose,
  onSaved,
}: {
  row: ImportGridRow;
  departments: string[];
  offices: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const start = { ...row.values };
  // A full name from the file is shown as first + last name.
  if (!start.firstName && !start.lastName && start.fullName) {
    const words = start.fullName.trim().split(/\s+/);
    start.lastName = words.length > 1 ? (words.pop() ?? "") : "";
    start.firstName = words.join(" ");
  }
  delete start.fullName;
  const [values, setValues] = useState<Record<string, string>>(start);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = (field: string) =>
    row.problems
      .filter((p) => p.field === field)
      .map((p) => p.message)
      .join(" ") || undefined;
  const set = (key: string, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));
  const text = (f: (typeof FIELDS)[number]) => (
    <TextField
      key={f.key}
      label={f.label}
      hint={f.hint}
      value={values[f.key] ?? ""}
      error={problem(f.key)}
      onChange={(e) => set(f.key, e.target.value)}
    />
  );

  return (
    <Sheet
      eyebrow={`Row ${row.position} · ${IMPORT_STATE_WORDS[importRowState(row)].toLowerCase()}`}
      title={rowName(row)}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          {error && <InlineError>{error}</InlineError>}
          <div className="grid grid-cols-[1fr_1.4fr] gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              loading={saving}
              onClick={async () => {
                setSaving(true);
                const r = await saveImportRowValues(row.id, values);
                setSaving(false);
                if (r.ok) onSaved();
                else setError(r.message);
              }}
            >
              Save row
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        {FIELDS.slice(0, 4).map(text)}
        {(
          [
            ["department", "Department / team", departments],
            ["office", "Office", offices],
          ] as const
        ).map(([key, label, names]) => (
          <div key={key} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">{label}</span>
            <Combobox
              ariaLabel={label}
              value={values[key] ?? ""}
              options={choiceOptions([...names], values[key])}
              invalid={Boolean(problem(key))}
              onChange={(v) => set(key, v)}
            />
            {problem(key) && <InlineError>{problem(key)}</InlineError>}
          </div>
        ))}
        {FIELDS.slice(4).map(text)}
        {Object.keys(row.other).length > 0 && (
          <p className="text-xs leading-normal text-graphite">
            Other columns in the file (not used):{" "}
            {Object.entries(row.other)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** Confirm (sheet): who is imported, who is left out; all or nothing. */
function ConfirmImport({
  importId,
  rows,
  onClose,
}: {
  importId: string;
  rows: ImportGridRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const split = confirmSplit(rows);
  const out = leftOutLines(rows);
  const n = split.people;
  return (
    <Sheet
      eyebrow="Needs your Confirm"
      title={`Import ${n} ${n === 1 ? "person" : "people"}?`}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          {error && <InlineError live>{error}</InlineError>}
          <div className="grid grid-cols-[1fr_1.8fr] gap-2">
            <Button variant="secondary" onClick={onClose}>
              Back
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const r = await confirmStaffImport(importId);
                setBusy(false);
                if (r.ok) {
                  onClose();
                  router.refresh();
                } else setError(r.message);
              }}
            >
              Confirm — import {n}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <SummaryTile label="working here" value={split.working} />
        <SummaryTile label="leavers · access ended" value={split.leavers} />
      </div>
      {out.length > 0 && (
        <p className="text-[13px] leading-normal">
          <strong>Left out ({out.length}):</strong> {out.join("; ")}.
        </p>
      )}
      <ul className="list-disc pl-4.5 text-[13px] leading-relaxed text-graphite">
        <li>
          Each person gets one{" "}
          <strong className="text-ink">Imported record</strong> (
          <strong className="text-ink">IMP-…</strong>) with the dates{" "}
          <strong className="text-ink">from your file</strong> — read-only,
          never signed, no PDF made by the app.
        </li>
        <li>
          They count in every report, the access lists and the assistant from
          now on, and can be offboarded or changed with a normal request.
        </li>
        <li>
          All or nothing. The file is kept as evidence (admins only) and the
          import is audited with today’s time. No email is sent.
        </li>
      </ul>
    </Sheet>
  );
}
