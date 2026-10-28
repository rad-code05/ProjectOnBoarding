"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  confirmBatchDrafts,
  discardBatch,
  saveBatchRowValues,
  setBatchRowIncluded,
} from "@/app/(app)/requests/batch/actions";
import {
  Button,
  Combobox,
  InlineError,
  Sheet,
  SummaryTile,
  TextField,
  type ComboboxOption,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { readDay } from "@/lib/requests/batch/onboarding";
import {
  batchCounts,
  fieldLabel,
  footerLine,
  rowName,
  rowState,
  sortForGrid,
  STATE_WORDS,
  type RowState,
  type ViewRow,
} from "@/lib/requests/batch/view";

export type GridRow = ViewRow & {
  id: string;
  other: Record<string, string>;
  ticketId: string | null;
  requestId: string | null;
};

export type GridBatch = {
  id: string;
  title: string;
  status: "open" | "created";
  meta: string;
  rows: GridRow[];
};

/** What a card lists (the rest is in Fix this row). */
const LINES: { label: string; fields: string[] }[] = [
  { label: "Work email", fields: ["workEmail"] },
  { label: "Job", fields: ["jobTitle", "department"] },
  { label: "Office · start", fields: ["office", "state", "city", "startDate"] },
  { label: "Manager", fields: ["manager"] },
  { label: "Access", fields: ["applications", "equipment", "physical"] },
  { label: "Nationality", fields: ["nationalities"] },
];

const show = (field: string, value: string) =>
  field === "startDate" && readDay(value)
    ? new Date(`${readDay(value)}T00:00:00Z`).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : value;

/**
 * The batch grid (boards *Batch grid*, *Fix a row*, *Confirm the batch*):
 * one card per person, rows with problems first; untick to leave out; Fix
 * this row; Create N drafts → Confirm → the drafts, all or nothing.
 */
export function BatchGrid({
  batch,
  departments,
  offices,
}: {
  batch: GridBatch;
  departments: string[];
  offices: string[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<RowState | "all">("all");
  const [fixing, setFixing] = useState<GridRow | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Include / leave out shows at once; the server's answer follows.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  const all = batch.rows.map((r) =>
    r.id in ticked ? { ...r, included: ticked[r.id] } : r,
  );
  const counts = batchCounts(all);
  const rows = sortForGrid(all).filter(
    (r) => filter === "all" || rowState(r) === filter,
  );

  if (batch.status === "created") return <Created batch={batch} />;

  async function include(row: GridRow, included: boolean) {
    setBusy(row.id);
    setError(null);
    setTicked((t) => ({ ...t, [row.id]: included }));
    const r = await setBatchRowIncluded(row.id, included);
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
    <div className="flex flex-col gap-4 pb-32">
      <section
        aria-label="Summary"
        className="grid grid-cols-3 gap-2 md:max-w-xl"
      >
        <SummaryTile label="Ready" value={counts.ready} />
        <SummaryTile label="Need attention" value={counts.attention} />
        <SummaryTile label="Left out" value={counts.left_out} />
      </section>

      <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
        {(
          [
            ["all", `All ${batch.rows.length}`],
            ["attention", `Need attention ${counts.attention}`],
            ["ready", `Ready ${counts.ready}`],
            ["left_out", `Left out ${counts.left_out}`],
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
                ? "text-white bg-ink"
                : "border border-field-border",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <InlineError>{error}</InlineError>}

      <ul
        aria-label="People in this batch"
        className="grid gap-2.5 md:grid-cols-2"
      >
        {rows.map((row) => {
          const state = rowState(row);
          const bad = new Set(row.problems.map((p) => p.field));
          return (
            <li
              key={row.id}
              aria-label={`${rowName(row)} — ${STATE_WORDS[state]}`}
              className={cn(
                "bg-white flex flex-col gap-2.5 rounded-card p-3.5",
                state === "attention"
                  ? "border-[1.5px] border-signal"
                  : "border border-line-subtle",
              )}
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  aria-label={`Include ${rowName(row)}`}
                  checked={row.included}
                  disabled={busy === row.id}
                  onChange={(e) => void include(row, e.target.checked)}
                  className="mt-0.5 size-5 accent-ink"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <strong className="text-[15px] md:text-sm">
                    {rowName(row)}
                  </strong>
                  <span className="text-xs text-graphite">
                    Row {row.position}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-[11px] font-bold whitespace-nowrap",
                    state === "attention"
                      ? "text-signal"
                      : state === "left_out"
                        ? "text-graphite"
                        : "",
                  )}
                >
                  {state === "ready" ? "✓ " : ""}
                  {STATE_WORDS[state]}
                </span>
              </div>
              {state !== "left_out" && (
                <dl className="flex flex-col text-[13px] md:text-xs">
                  {LINES.map((line) => {
                    const values = line.fields
                      .map((f) => (row.values[f] ? show(f, row.values[f]) : ""))
                      .filter(Boolean);
                    const lineProblems = row.problems.filter((p) =>
                      line.fields.includes(p.field),
                    );
                    if (!values.length && !lineProblems.length) return null;
                    const flagged = line.fields.some((f) => bad.has(f));
                    return (
                      <div
                        key={line.label}
                        className={cn(
                          "flex gap-2.5 py-1.5",
                          flagged
                            ? "-mx-2 rounded-[8px] border-[1.5px] border-signal px-2"
                            : "border-t border-line-subtle",
                        )}
                      >
                        <dt className="w-24 shrink-0 text-graphite">
                          {line.label}
                        </dt>
                        <dd className="flex min-w-0 flex-col gap-0.5 break-words">
                          <span>{values.join(" · ") || "—"}</span>
                          {lineProblems.map((p) => (
                            <span
                              key={p.message}
                              className="text-xs font-semibold text-signal"
                            >
                              {fieldLabel(p.field)}: {p.message}
                            </span>
                          ))}
                        </dd>
                      </div>
                    );
                  })}
                  {row.problems
                    .filter(
                      (p) => !LINES.some((l) => l.fields.includes(p.field)),
                    )
                    .map((p) => (
                      <dd
                        key={p.message}
                        className="text-xs font-semibold text-signal"
                      >
                        {fieldLabel(p.field)}: {p.message}
                      </dd>
                    ))}
                </dl>
              )}
              <Button
                size="sm"
                variant={state === "attention" ? "primary" : "secondary"}
                className="self-start"
                onClick={() => setFixing(row)}
              >
                {state === "attention" ? "Fix this row" : "Edit"}
              </Button>
            </li>
          );
        })}
      </ul>

      <div className="bg-white fixed inset-x-0 bottom-0 z-10 flex flex-col gap-2 border-t border-line-subtle px-4 pt-3 pb-5 md:static md:rounded-card md:border">
        <span className="text-xs text-graphite">{footerLine(counts)}</span>
        <div className="grid grid-cols-[1fr_1.6fr] gap-2 md:flex md:justify-end">
          <Button variant="secondary" onClick={() => setDiscarding(true)}>
            Discard
          </Button>
          <Button
            disabled={counts.ready === 0}
            onClick={() => setConfirming(true)}
          >
            Create {counts.ready} draft{counts.ready === 1 ? "" : "s"}…
          </Button>
        </div>
      </div>

      {fixing && (
        <FixRowSheet
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
        <ConfirmSheet
          batch={{ ...batch, rows: all }}
          onClose={() => setConfirming(false)}
        />
      )}
      {discarding && (
        <Sheet
          eyebrow="Batch"
          title="Discard this batch?"
          onClose={() => setDiscarding(false)}
        >
          <p className="text-sm leading-normal">
            Nothing was created from it. The list is deleted; you can read it
            again any time.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setDiscarding(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const r = await discardBatch(batch.id);
                if (r.ok) router.push("/requests");
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

const TEXT_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "workEmail", label: "Work email" },
  { key: "jobTitle", label: "Job title / role" },
  { key: "manager", label: "Manager" },
  {
    key: "startDate",
    label: "Start date",
    hint: "Like 2026-11-02 or 02/11/2026.",
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
    key: "equipment",
    label: "Equipment",
    hint: "Comma between items, e.g. Laptop · macOS.",
  },
  {
    key: "physical",
    label: "Physical access",
    hint: "e.g. Office access (Badge).",
  },
  { key: "requestedBy", label: "Requested by" },
];

/** Fix a row (sheet): the row's cells, the same lists as the form; Save checks again. */
function FixRowSheet({
  row,
  departments,
  offices,
  onClose,
  onSaved,
}: {
  row: GridRow;
  departments: string[];
  offices: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const start = { ...row.values };
  // A full name from the list is shown as first + last name.
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
  const choices = (names: string[], current?: string): ComboboxOption[] => {
    const list = names.map((n) => ({ value: n, label: n }));
    return current && !names.includes(current)
      ? [
          { value: current, label: `${current} (from the list — not known)` },
          ...list,
        ]
      : list;
  };

  return (
    <Sheet
      eyebrow={`Row ${row.position} · ${STATE_WORDS[rowState(row)].toLowerCase()}`}
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
                const r = await saveBatchRowValues(row.id, values);
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
        {TEXT_FIELDS.slice(0, 4).map((f) => (
          <TextField
            key={f.key}
            label={f.label}
            value={values[f.key] ?? ""}
            error={problem(f.key)}
            onChange={(e) => set(f.key, e.target.value)}
          />
        ))}
        {(
          [
            ["department", "Department / team", departments],
            ["office", "Office", offices],
          ] as const
        ).map(([key, label, names]) => (
          <div key={key} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold" id={`batch-${key}`}>
              {label}
            </span>
            <Combobox
              ariaLabel={label}
              value={values[key] ?? ""}
              options={choices([...names], values[key])}
              invalid={Boolean(problem(key))}
              onChange={(v) => set(key, v)}
            />
            {problem(key) && <InlineError>{problem(key)}</InlineError>}
          </div>
        ))}
        {TEXT_FIELDS.slice(4).map((f) => (
          <TextField
            key={f.key}
            label={f.label}
            hint={f.hint}
            value={values[f.key] ?? ""}
            error={problem(f.key)}
            onChange={(e) => set(f.key, e.target.value)}
          />
        ))}
        {Object.keys(row.other).length > 0 && (
          <p className="text-xs leading-normal text-graphite">
            Other columns in the list (not used):{" "}
            {Object.entries(row.other)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** Confirm (sheet): who is created, who is left out; all or nothing. */
function ConfirmSheet({
  batch,
  onClose,
}: {
  batch: GridBatch;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = batch.rows.filter((r) => rowState(r) === "ready");
  const out = batch.rows.filter((r) => rowState(r) !== "ready");
  const n = ready.length;
  return (
    <Sheet
      eyebrow="Needs your Confirm"
      title={`Create ${n} draft onboarding${n === 1 ? "" : "s"}?`}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          {error && <InlineError>{error}</InlineError>}
          <div className="grid grid-cols-[1fr_1.8fr] gap-2">
            <Button variant="secondary" onClick={onClose}>
              Back
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const r = await confirmBatchDrafts(batch.id);
                setBusy(false);
                if (r.ok) {
                  onClose();
                  router.refresh();
                } else setError(r.message);
              }}
            >
              Confirm — create {n} draft{n === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      }
    >
      <p className="bg-white rounded-card border border-line-subtle px-3.5 py-3 text-[13px] leading-relaxed">
        {ready.map(rowName).join(", ")}
      </p>
      {out.length > 0 && (
        <p className="text-[13px] leading-normal">
          <strong>Not created ({out.length}):</strong>{" "}
          {out
            .map(
              (r) =>
                `${rowName(r)} — ${rowState(r) === "left_out" ? "left out" : "needs attention"}`,
            )
            .join("; ")}
          .
        </p>
      )}
      <ul className="list-disc pl-4.5 text-[13px] leading-relaxed text-graphite">
        <li>
          The values you checked are{" "}
          <strong className="text-ink">written straight into each draft</strong>{" "}
          — no second accept. The drafts are recorded as prepared with the
          assistant for you.
        </li>
        <li>
          Creates <strong className="text-ink">drafts only</strong>. Nothing is
          sent to Slack, Google or anywhere else.
        </li>
        <li>
          Each request is still executed, ticked in section 9 and signed{" "}
          <strong className="text-ink">one by one</strong>.
        </li>
      </ul>
    </Sheet>
  );
}

/** After Confirm: the drafts created (board *Confirm the batch*, lower half). */
function Created({ batch }: { batch: GridBatch }) {
  const made = batch.rows.filter((r) => r.requestId);
  return (
    <div className="flex flex-col gap-4">
      <div
        role="status"
        className="text-white rounded-card bg-ink px-3.5 py-3 text-sm leading-normal"
      >
        <strong>
          {made.length} draft{made.length === 1 ? "" : "s"} created.
        </strong>{" "}
        They are on the Requests list as Draft. Add asset tags and anything
        else, then Start execution on each.
      </div>
      <ul
        aria-label="Drafts created"
        className="bg-white rounded-card border border-line-subtle"
      >
        {made.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-2.5 border-b border-line-subtle px-3.5 py-3 last:border-b-0"
          >
            <span className="flex flex-1 flex-col">
              <strong className="text-sm">{rowName(r)}</strong>
              <span className="text-xs text-graphite">{r.ticketId}</span>
            </span>
            <Link
              href={`/requests/${r.requestId}`}
              className="text-[13px] font-semibold underline"
            >
              Open
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/requests"
        className="flex h-11 items-center self-start rounded-pill border border-ink px-4.5 text-sm font-semibold"
      >
        Go to the Requests list
      </Link>
    </div>
  );
}
