"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { saveExecution } from "@/app/(app)/requests/actions";
import { CHECK_NOTES, type CheckValue } from "@/lib/requests/execution";
import { InlineError } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  doneCount,
  type ChecklistItem,
  type ExecutionRecord,
} from "@/lib/requests/execution";
import { SectionFlag, sectionFrame } from "./ReturnedCard";

/**
 * Section 9 — IT execution confirmation (design: Phone · In execution).
 * Checklist for the request's ticket type, implementation notes, and the
 * system-set "Executed by" / "Execution started". Each tick saves at once;
 * notes save when you leave the field.
 */
export function ExecutionSection({
  requestId,
  items,
  record,
  editable,
  startedLabel,
  checks,
  onChecksChange,
  flag,
  suggested,
}: {
  requestId: string;
  items: ChecklistItem[];
  record: ExecutionRecord;
  editable: boolean;
  startedLabel: string | null;
  /** Held by the form so the section chip shows the same count. */
  checks: Record<string, CheckValue>;
  onChecksChange: (checks: Record<string, CheckValue>) => void;
  /** "Flagged by Moises" after a return, or null. */
  flag?: string | null;
  /** The robot's draft of the notes, shown above them (F16e-1). */
  suggested?: ReactNode;
}) {
  const notesId = useId();
  const [notes, setNotes] = useState(record.notes ?? "");
  const [savedNotes, setSavedNotes] = useState(record.notes ?? "");
  const [executedBy, setExecutedBy] = useState(record.executedBy);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const done = doneCount(items, checks);

  // Notes accepted from the robot arrive as a new record after the refresh:
  // take them, unless the person is in the middle of typing their own.
  const [seenNotes, setSeenNotes] = useState(record.notes);
  if (record.notes !== seenNotes) {
    setSeenNotes(record.notes);
    if (notes === savedNotes) setNotes(record.notes ?? "");
    setSavedNotes(record.notes ?? "");
  }

  const save = (nextChecks: Record<string, CheckValue>, nextNotes: string) =>
    startSaving(async () => {
      const result = await saveExecution({
        requestId,
        checks: nextChecks,
        notes: nextNotes || null,
      });
      if (result.ok) {
        setError(null);
        setSavedNotes(nextNotes);
        setExecutedBy((current) => current ?? "You");
      } else {
        setError(result.message);
        onChecksChange(record.checks);
      }
    });

  const toggle = (key: string, on: CheckValue) => {
    const next = { ...checks, [key]: on };
    onChecksChange(next);
    save(next, notes);
  };

  return (
    <section
      id="s9"
      aria-labelledby="s9-title"
      className={cn(
        "flex flex-col gap-3.5 rounded-card bg-paper p-4 md:col-span-2 md:px-5",
        sectionFrame(flag),
      )}
    >
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-xs font-semibold text-graphite md:text-[11px]">
          09
        </span>
        <h2 id="s9-title" className="font-serif text-[21px] md:text-[19px]">
          IT execution confirmation
        </h2>
        <SectionFlag label={flag} />
        <span
          role="status"
          className="ml-auto text-xs font-semibold whitespace-nowrap text-graphite md:text-[11px]"
        >
          {saving ? "Saving…" : `${done} of ${items.length} done`}
        </span>
      </div>

      {error && <InlineError live>{error}</InlineError>}

      <fieldset className="flex flex-col gap-2" disabled={!editable}>
        <legend className="pb-2 text-xs font-semibold">Checklist</legend>
        {items.map((item) => {
          const value = checks[item.key];
          const on = value === true;
          // Not needed (2026-10-13) or no changes made (access change, 2026-10-14).
          const other =
            value === "not_needed" || value === "no_change" ? value : null;
          const notNeeded = other !== null;
          return (
            <div
              key={item.key}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-3.5 py-3 has-focus-visible:outline-2 has-focus-visible:outline-ink md:py-2.5",
                on || notNeeded ? "border-sand bg-sand" : "border-field-border",
              )}
            >
              <label
                className={cn(
                  "flex flex-1 cursor-pointer items-start gap-3",
                  (!editable || notNeeded) && "cursor-default",
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!editable || notNeeded}
                  onChange={(event) => toggle(item.key, event.target.checked)}
                  className="mt-px size-5.5 shrink-0 accent-ink md:size-4.5"
                />
                <span
                  className={cn(
                    "text-[15px] leading-snug md:text-[13px]",
                    on ? "font-semibold" : "font-medium",
                    notNeeded && "text-graphite",
                  )}
                >
                  {item.label}
                  {other && (
                    <span className="font-semibold text-ink">
                      {" "}
                      — {CHECK_NOTES[other]}
                    </span>
                  )}
                </span>
              </label>
              {editable && !on && (
                <button
                  type="button"
                  aria-pressed={notNeeded}
                  aria-label={
                    other === "no_change"
                      ? `${item.label}: changes were made after all`
                      : `${item.label}: not needed`
                  }
                  onClick={() =>
                    toggle(item.key, notNeeded ? false : "not_needed")
                  }
                  className="-my-2 h-11 shrink-0 px-1 text-xs font-semibold underline underline-offset-[3px] md:h-auto md:py-1"
                >
                  {other === "no_change"
                    ? "Changes were made after all"
                    : notNeeded
                      ? "Needed after all"
                      : "Not needed"}
                </button>
              )}
            </div>
          );
        })}
      </fieldset>

      {suggested}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={notesId} className="text-xs font-semibold">
          Implementation notes{" "}
          <span className="font-normal text-graphite">(optional)</span>
        </label>
        <textarea
          id={notesId}
          rows={3}
          maxLength={2000}
          disabled={!editable}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => notes !== savedNotes && save(checks, notes)}
          placeholder="What was done, anything unusual"
          className="resize-none rounded-field border border-field-border px-3 py-2.5 text-base leading-snug outline-none focus:border-ink disabled:bg-sand disabled:text-graphite md:text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:max-w-lg">
        {[
          { label: "Executed by", value: executedBy ?? "—" },
          { label: "Execution started", value: startedLabel ?? "—" },
        ].map((field) => (
          <div key={field.label} className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold md:text-[11px]">
              {field.label}
            </span>
            <span className="flex h-12 items-center rounded-field bg-sand px-3 text-sm text-graphite md:h-9 md:text-xs">
              {field.value}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-graphite">
        Names and times are recorded by the system and can&apos;t be changed.
      </p>
    </section>
  );
}
