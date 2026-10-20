"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button, CloseIcon, Sheet, sheetPill } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  DEFAULT_REPORT_FILTERS,
  PERIOD_LABELS,
  reportChips,
  reportParams,
  type ReportFilters,
} from "@/lib/reports/filters";
import { REQUEST_TYPES, TYPE_LABELS, countryName } from "@/lib/requests/labels";

const SEARCH_DELAY_MS = 300;
const COUNT_DELAY_MS = 300;

const selectClass =
  "h-12 rounded-[10px] border border-field-border bg-paper px-3 text-base";

/**
 * Search, active filters as removable chips and the Filters sheet (board:
 * Phone · Report filters). Filters live in the URL; the server runs the
 * report. `count` answers "Show N requests" while choices change.
 * `counts`: a report of numbers (no search, no request type).
 * `types: false`: one request type only (Offboarding SLA) — search, no type.
 */
export function ReportFilterBar({
  filters,
  departments,
  countries,
  count,
  noun = "requests",
  counts = false,
  types = !counts,
}: {
  filters: ReportFilters;
  departments: { id: number; name: string }[];
  countries: string[];
  count: (search: string) => Promise<number | null>;
  noun?: string;
  counts?: boolean;
  types?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(filters.q);
  const lastQ = useRef(filters.q);

  const apply = (patch: Partial<ReportFilters>) => {
    const query = reportParams({ ...filters, ...patch }).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  useEffect(() => {
    if (q.trim() === lastQ.current) return;
    const timer = setTimeout(() => {
      lastQ.current = q.trim();
      apply({ q: q.trim() });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  });

  const names = Object.fromEntries(departments.map((d) => [d.id, d.name]));
  const chips = reportChips(filters, names);

  return (
    <div className="flex flex-col gap-2.5">
      {!counts && (
        <label className="flex h-12 items-center gap-2.5 rounded-pill border border-field-border bg-paper px-4 md:h-[38px] md:w-80 md:px-3">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
            className="shrink-0 text-graphite"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            aria-label="Search name, email or ticket"
            placeholder="Name, email or ticket"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-stone md:text-xs"
          />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {chips.length > 0 && (
          <ul aria-label="Active filters" className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <li key={chip.label}>
                <button
                  type="button"
                  onClick={() => apply(chip.clear)}
                  aria-label={`Remove filter: ${chip.label}`}
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-pill bg-ink pr-2.5 pl-3 text-xs font-semibold text-paper"
                >
                  {chip.label}
                  <CloseIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="ml-auto h-[42px] md:h-9"
          onClick={() => setOpen(true)}
        >
          Filters{chips.length ? ` · ${chips.length}` : ""}
        </Button>
      </div>
      {open && (
        <ReportFiltersSheet
          filters={filters}
          departments={departments}
          countries={countries}
          count={count}
          noun={noun}
          types={types}
          onClose={() => setOpen(false)}
          onApply={(next) => {
            setOpen(false);
            apply(next);
          }}
        />
      )}
    </div>
  );
}

function ReportFiltersSheet({
  filters,
  departments,
  countries,
  count,
  noun,
  types,
  onApply,
  onClose,
}: {
  filters: ReportFilters;
  departments: { id: number; name: string }[];
  countries: string[];
  count: (search: string) => Promise<number | null>;
  noun: string;
  types: boolean;
  onApply: (next: ReportFilters) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(filters);
  const [n, setN] = useState<number | null>(null);
  const change = (patch: Partial<ReportFilters>) =>
    setDraft((d) => ({ ...d, ...patch }));
  const datesSet = Boolean(draft.from || draft.to);

  const search = reportParams(draft).toString();
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      count(search).then((value) => {
        if (current) setN(value);
      });
    }, COUNT_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [search, count]);

  return (
    <Sheet
      eyebrow="Report"
      title="Filters"
      onClose={onClose}
      footer={
        <div className="grid grid-cols-[1fr_1.4fr] gap-2">
          <Button
            variant="secondary"
            onClick={() => setDraft({ ...DEFAULT_REPORT_FILTERS, q: draft.q })}
          >
            Clear all
          </Button>
          <Button onClick={() => onApply(draft)}>
            {n === null
              ? `Show ${noun}`
              : `Show ${n} ${n === 1 ? noun.replace(/s$/, "") : noun}`}
          </Button>
        </div>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold">Period</legend>
        <div className="grid grid-cols-4 gap-1 rounded-pill bg-sand p-1">
          {(["month", "3m", "12m"] as const).map((period) => {
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
          <label
            className={sheetPill(
              datesSet || draft.period === "all",
              datesSet || draft.period === "all"
                ? "bg-ink text-paper"
                : undefined,
            )}
          >
            <input
              type="radio"
              name={`${id}-period`}
              checked={datesSet || draft.period === "all"}
              onChange={() => change({ period: "all" })}
              className="sr-only"
            />
            Dates
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-graphite">
            From
            <input
              type="date"
              value={draft.from ?? ""}
              max={draft.to ?? undefined}
              onChange={(e) => change({ from: e.target.value || null })}
              className={cn(selectClass, "text-ink")}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-graphite">
            To
            <input
              type="date"
              value={draft.to ?? ""}
              min={draft.from ?? undefined}
              onChange={(e) => change({ to: e.target.value || null })}
              className={cn(selectClass, "text-ink")}
            />
          </label>
        </div>
        <p className="text-xs text-graphite">
          Days in the company timezone. Empty dates = all time.
        </p>
      </fieldset>

      {types && (
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Request type
          <select
            value={draft.type ?? ""}
            onChange={(e) =>
              change({
                type: (e.target.value || null) as ReportFilters["type"],
              })
            }
            className={cn(selectClass, "font-normal")}
          >
            <option value="">All types</option>
            {REQUEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Country
        <select
          value={draft.country ?? ""}
          onChange={(e) => change({ country: e.target.value || null })}
          className={cn(selectClass, "font-normal")}
        >
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {countryName(c)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Department
        <select
          value={draft.department ?? ""}
          onChange={(e) =>
            change({
              department: e.target.value ? Number(e.target.value) : null,
            })
          }
          className={cn(selectClass, "font-normal")}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
    </Sheet>
  );
}
