"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDate, formatDay, formatTime } from "@/lib/requests/format";
import {
  TIMELINE_LABELS,
  slaHeadline,
  type SlaResult,
  type SlaTimeline,
} from "@/lib/requests/offboarding";
import { SectionFlag } from "./ReturnedCard";

/** The clock for the countdown: now, refreshed every 30 seconds. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const at = (iso: string, timeZone: string) =>
  `${formatDay(iso, timeZone)}, ${formatTime(iso, timeZone)}`;

/**
 * Section 8 once execution has started (boards Offboarding in execution and
 * SLA missed or met): countdown, progress, then met / missed — worked out by
 * the database from the ticks. Missed → the reason, required before signing.
 */
export function SlaPanel({
  dueAt,
  sla,
  timeline,
  cutoffDate,
  cutoffTime,
  lastWorkingDay,
  companyTimezone,
  reason,
  onReasonChange,
  reasonError,
  disabled,
  flag,
}: {
  dueAt: string;
  sla: SlaResult;
  timeline: SlaTimeline | null;
  cutoffDate: string;
  cutoffTime: string;
  lastWorkingDay: string;
  companyTimezone: string;
  reason: string;
  onReasonChange: (value: string) => void;
  reasonError?: string;
  disabled: boolean;
  flag?: string | null;
}) {
  const now = useNow();
  const reasonId = useId();
  const head = slaHeadline(dueAt, sla, now);
  const alarm = head.kind !== "met";
  const city = (companyTimezone.split("/").pop() ?? companyTimezone).replaceAll(
    "_",
    " ",
  );
  const percent = sla.total ? Math.round((sla.done / sla.total) * 100) : 0;
  const reasonOk = Boolean(reason.trim()) && !reasonError;

  const facts: [string, string][] = [
    ["Deadline", at(dueAt, companyTimezone)],
    ["Cut-off", `${formatDate(cutoffDate || null)}, ${cutoffTime || "—"}`],
    ["Last working day", formatDate(lastWorkingDay || null)],
    [
      "Last access removed",
      sla.removedAt ? at(sla.removedAt, companyTimezone) : "Not yet",
    ],
  ];

  return (
    <section
      id="s8"
      aria-labelledby="s8-eyebrow s8-title"
      className={cn(
        "flex flex-col gap-3 rounded-card bg-paper p-4 md:col-span-2 md:px-5",
        alarm || flag ? "border-2 border-signal" : "border border-line",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-xs font-semibold text-graphite md:text-[11px]">
          08
        </span>
        <span
          id="s8-eyebrow"
          className="text-xs font-semibold text-graphite md:text-[11px]"
        >
          Access removal SLA
        </span>
        <SectionFlag label={flag} />
        <span className="ml-auto">
          {head.kind === "met" || head.kind === "missed" ? (
            <span
              className={cn(
                "rounded-pill px-2.5 py-0.75 text-[11px] font-bold text-paper",
                head.kind === "met" ? "bg-ink" : "bg-signal",
              )}
            >
              {head.kind === "met" ? "Met" : "Missed"}
            </span>
          ) : (
            <span className="text-xs font-semibold text-graphite md:text-[11px]">
              {timeline ? TIMELINE_LABELS[timeline] : ""}
            </span>
          )}
        </span>
      </div>
      <h2
        id="s8-title"
        className="font-serif text-[30px] leading-tight md:text-[26px]"
      >
        {head.text}
      </h2>
      {(head.kind === "due" || head.kind === "overdue") && (
        <span className="text-sm font-bold text-signal">
          Remove all access by {at(dueAt, companyTimezone)}
        </span>
      )}
      <div className="flex flex-col gap-1.5">
        <div
          role="progressbar"
          aria-label="Access removed"
          aria-valuemin={0}
          aria-valuemax={sla.total}
          aria-valuenow={sla.done}
          className="h-2 overflow-hidden rounded-pill bg-line-subtle"
        >
          <div
            className="h-full rounded-pill bg-ink"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-[13px] font-bold">
          {sla.done} of {sla.total} removed{" "}
          <span className="font-medium text-graphite">
            · applications and access; equipment is tracked apart
          </span>
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-2.5 border-t border-line-subtle pt-2.5 md:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-xs font-semibold text-graphite">{label}</dt>
            <dd className="text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      <span className="text-xs leading-normal text-graphite">
        {city} time (company timezone). Met or missed is worked out from the
        times of your ticks — not typed.
      </span>
      {sla.met === false && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={reasonId} className="text-[13px] font-semibold">
            Why was the SLA missed? <span className="text-signal">*</span>
          </label>
          <textarea
            id={reasonId}
            data-fix="sla-reason"
            rows={3}
            value={reason}
            disabled={disabled}
            aria-invalid={!reasonOk}
            aria-describedby={`${reasonId}-help`}
            placeholder="e.g. the admin removal needed the vendor; ticket [no.]"
            onChange={(event) => onReasonChange(event.target.value)}
            className={cn(
              "resize-none rounded-field px-3 py-2.5 text-base leading-snug md:text-[13px]",
              reasonOk
                ? "border border-field-border"
                : "border-2 border-signal",
            )}
          />
          <span
            id={`${reasonId}-help`}
            className={cn(
              "text-xs font-semibold",
              reasonOk ? "text-graphite" : "text-signal",
            )}
          >
            {reasonError ??
              "Required before Review & sign. Moises sees it, and it goes on the PDF and the SLA report."}
          </span>
        </div>
      )}
    </section>
  );
}
