"use client";

import { useEffect, useId, useState } from "react";
import { countAudit } from "@/app/(app)/audit/actions";
import { Button, Sheet, sheetPill } from "@/components/ui";
import {
  AUDIT_GROUPS,
  AUDIT_PERIODS,
  DEFAULT_AUDIT_FILTERS,
  GROUP_LABELS,
  PERIOD_LABELS,
  auditParams,
  type AuditFilters,
} from "@/lib/audit/filters";
import type { AuditPerson } from "@/lib/audit/log";
import { cn } from "@/lib/cn";

const COUNT_DELAY_MS = 300;

const dateClass =
  "h-11 min-w-0 flex-1 rounded-pill border border-field-border bg-paper px-3 text-base";

/**
 * Who · What happened · When · Hide the test users (board: Audit log
 * filters). Nothing changes on the page until "Show N events"; the number
 * is asked from the database while choices change.
 */
export function AuditFiltersSheet({
  filters,
  people,
  onApply,
  onClose,
}: {
  filters: AuditFilters;
  people: AuditPerson[];
  onApply: (next: AuditFilters) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(filters);
  const [count, setCount] = useState<number | null>(null);
  const change = (patch: Partial<AuditFilters>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const search = auditParams(draft).toString();
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      countAudit(search).then((n) => {
        if (current) setCount(n);
      });
    }, COUNT_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [search]);

  const shown = people.filter((p) => !draft.hideTests || !p.test);
  const datesSet = Boolean(draft.from || draft.to);
  const whoOptions: [string, string][] = [
    ["", "Everyone"],
    ...shown.map((p): [string, string] => [p.id, p.name]),
    ["system", "System"],
  ];

  return (
    <Sheet
      eyebrow="Audit log"
      title="Filters"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          <Button
            variant="text"
            onClick={() =>
              setDraft({
                ...DEFAULT_AUDIT_FILTERS,
                q: draft.q,
                source: draft.source,
              })
            }
          >
            Clear all
          </Button>
          <Button className="flex-1" onClick={() => onApply(draft)}>
            {count === null
              ? "Show events"
              : `Show ${count} event${count === 1 ? "" : "s"}`}
          </Button>
        </div>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold">Who</legend>
        <div className="flex flex-wrap gap-1.5">
          {whoOptions.map(([value, label]) => {
            const on = (draft.who ?? "") === value;
            return (
              <label
                key={value || "everyone"}
                className={sheetPill(
                  on,
                  cn(
                    "border px-3.5",
                    on ? "border-ink bg-ink text-paper" : "border-line",
                  ),
                )}
              >
                <input
                  type="radio"
                  name={`${id}-who`}
                  checked={on}
                  onChange={() => change({ who: value || null })}
                  className="sr-only"
                />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-2 text-sm font-bold">What happened</legend>
        {AUDIT_GROUPS.map((group) => (
          <label
            key={group}
            className="flex cursor-pointer items-start gap-3 rounded-[12px] py-2"
          >
            <input
              type="checkbox"
              checked={draft.groups.includes(group)}
              onChange={(e) =>
                change({
                  groups: e.target.checked
                    ? AUDIT_GROUPS.filter(
                        (g) => g === group || draft.groups.includes(g),
                      )
                    : draft.groups.filter((g) => g !== group),
                })
              }
              className="mt-0.5 size-5.5 shrink-0 accent-ink"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">
                {GROUP_LABELS[group].label}
              </span>
              <span className="text-xs text-graphite">
                {GROUP_LABELS[group].note}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2 text-sm font-bold">When</legend>
        <div className="grid grid-cols-4 gap-1 rounded-pill bg-sand p-1">
          {AUDIT_PERIODS.map((period) => {
            const on = !datesSet && draft.period === period;
            return (
              <label
                key={period}
                className={sheetPill(on, on ? "bg-ink text-paper" : undefined)}
              >
                <input
                  type="radio"
                  name={`${id}-period`}
                  checked={on}
                  onChange={() => change({ period, from: null, to: null })}
                  className="sr-only"
                />
                {PERIOD_LABELS[period]}
              </label>
            );
          })}
        </div>
        <p className="text-sm text-graphite">Or pick dates:</p>
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="From"
            value={draft.from ?? ""}
            max={draft.to ?? undefined}
            onChange={(e) => change({ from: e.target.value || null })}
            className={dateClass}
          />
          <span className="text-sm text-graphite">to</span>
          <input
            type="date"
            aria-label="To"
            value={draft.to ?? ""}
            min={draft.from ?? undefined}
            onChange={(e) => change({ to: e.target.value || null })}
            className={dateClass}
          />
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3 rounded-card border border-line p-3.5">
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-sm font-bold">Hide the test users</span>
          <span className="text-xs leading-normal text-graphite">
            The automatic browser tests sign in many times a day. Their entries
            are kept but hidden.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={draft.hideTests}
          onChange={(e) =>
            change({
              hideTests: e.target.checked,
              // A hidden person can't stay selected.
              who:
                e.target.checked && people.find((p) => p.id === draft.who)?.test
                  ? null
                  : draft.who,
            })
          }
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="relative mt-0.5 h-7 w-12 shrink-0 rounded-pill bg-field-border transition-colors peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink after:absolute after:top-1 after:left-1 after:size-5 after:rounded-pill after:bg-paper after:transition-transform peer-checked:after:translate-x-5"
        />
      </label>
    </Sheet>
  );
}
