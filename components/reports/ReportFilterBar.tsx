"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Button,
  CloseIcon,
  Combobox,
  Sheet,
  sheetPill,
  type ComboboxOption,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  DEFAULT_REPORT_FILTERS,
  PERIOD_LABELS,
  reportChips,
  reportNames,
  reportParams,
  type ReportFilters,
} from "@/lib/reports/filters";
import { REQUEST_TYPES, TYPE_LABELS, countryName } from "@/lib/requests/labels";

const SEARCH_DELAY_MS = 300;
const COUNT_DELAY_MS = 300;

/** What the sheet offers (`loadReportOptions`); offices etc. are optional. */
export type FilterOptions = {
  departments: { id: number; name: string }[];
  countries: string[];
  offices?: {
    id: number;
    name: string;
    country: string;
    usesRegions: boolean;
    active: boolean;
  }[];
  regions?: { id: number; country: string; name: string }[];
  cities?: { id: number; officeId: number; regionId: number; name: string }[];
  nationalities?: string[];
};

const selectClass =
  "h-12 rounded-[10px] border border-field-border bg-paper px-3 text-base";

/**
 * Search, active filters as removable chips and the Filters sheet (board:
 * Phone · Report filters). Filters live in the URL; the server runs the
 * report. `count` answers "Show N requests" while choices change.
 * `counts`: a report of numbers (no search, no request type).
 * `types: false`: one request type only (Offboarding SLA) — search, no type.
 * `periods: false`: a "today" report (Access by application) — no period;
 * `lead` sits before the chips ("As of today"); `search` words the box;
 * `keep`: URL parameters that are not filters (the tab, the item) stay.
 * `places: false`: no country / department / office / nationality (Open
 * requests by status).
 */
export function ReportFilterBar({
  filters,
  options,
  count,
  noun = "requests",
  counts = false,
  types = !counts,
  periods = true,
  nounOne,
  lead,
  search = "Name, email or ticket",
  keep,
  places = true,
}: {
  filters: ReportFilters;
  options: FilterOptions;
  count: (search: string) => Promise<number | null>;
  noun?: string;
  counts?: boolean;
  types?: boolean;
  periods?: boolean;
  /** Singular of `noun` when it is not just without the "s" ("person"). */
  nounOne?: string;
  lead?: ReactNode;
  search?: string;
  keep?: Record<string, string>;
  places?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(filters.q);
  const lastQ = useRef(filters.q);

  const apply = (patch: Partial<ReportFilters>) => {
    const params = new URLSearchParams(keep);
    for (const [key, value] of reportParams({ ...filters, ...patch })) {
      params.set(key, value);
    }
    const query = params.toString();
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

  const names = reportNames(options);
  const chips = reportChips(
    periods ? filters : { ...filters, period: "all", from: null, to: null },
    names,
  );

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
            aria-label={`Search ${search.charAt(0).toLowerCase()}${search.slice(1)}`}
            placeholder={search}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-stone md:text-xs"
          />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {lead}
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
          options={options}
          count={count}
          noun={noun}
          nounOne={nounOne}
          types={types}
          periods={periods}
          places={places}
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
  options,
  count,
  noun,
  nounOne,
  types,
  periods,
  places,
  onApply,
  onClose,
}: {
  filters: ReportFilters;
  options: FilterOptions;
  count: (search: string) => Promise<number | null>;
  noun: string;
  nounOne?: string;
  types: boolean;
  periods: boolean;
  places: boolean;
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
              : `Show ${n} ${n === 1 ? (nounOne ?? noun.replace(/s$/, "")) : noun}`}
          </Button>
        </div>
      }
    >
      {periods && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold">Period</legend>
          <div className="grid grid-cols-4 gap-1 rounded-pill bg-sand p-1">
            {(["month", "3m", "12m"] as const).map((period) => {
              const on = !datesSet && draft.period === period;
              return (
                <label
                  key={period}
                  className={sheetPill(
                    on,
                    on ? "bg-ink text-paper" : undefined,
                  )}
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
      )}

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
      {places && (
        <WhereFields id={id} draft={draft} options={options} change={change} />
      )}
    </Sheet>
  );
}

/**
 * "Where they work" — Office, then (US) State + City, Country, Department —
 * and Nationality (board: Phone · Report filters with office).
 */
function WhereFields({
  id,
  draft,
  options,
  change,
}: {
  id: string;
  draft: ReportFilters;
  options: FilterOptions;
  change: (patch: Partial<ReportFilters>) => void;
}) {
  const offices = options.offices ?? [];
  const office = offices.find((o) => o.id === draft.office);
  const officeChoices: ComboboxOption[] = offices.length
    ? [
        ...offices.map((o) => ({
          value: String(o.id),
          label: o.active ? o.name : `${o.name} (retired)`,
        })),
        { value: "0", label: "Not set" },
      ]
    : [];
  const regionChoices: ComboboxOption[] = office?.usesRegions
    ? (options.regions ?? [])
        .filter((r) => r.country === office.country)
        .map((r) => ({ value: String(r.id), label: r.name }))
    : [];
  const cityChoices: ComboboxOption[] =
    office && draft.region
      ? (options.cities ?? [])
          .filter(
            (c) => c.officeId === office.id && c.regionId === draft.region,
          )
          .map((c) => ({ value: String(c.id), label: c.name }))
      : [];
  const nationalityChoices: ComboboxOption[] = [
    ...(options.nationalities ?? []).map((c) => ({
      value: c,
      label: countryName(c),
    })),
    { value: "none", label: "Not set" },
  ];
  const num = (value: string) => (value === "" ? null : Number(value));

  return (
    <>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-bold">Where they work</legend>
        {officeChoices.length > 0 && (
          <div className="flex flex-col gap-1.5 text-sm font-semibold">
            <label htmlFor={`${id}-office`}>Office</label>
            <Combobox
              id={`${id}-office`}
              value={draft.office === null ? "" : String(draft.office)}
              onChange={(value) =>
                change({ office: num(value), region: null, city: null })
              }
              options={officeChoices}
              placeholder="All offices"
              noMatch={() => "No office matches"}
              className="font-normal"
            />
          </div>
        )}
        {regionChoices.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5 text-sm font-semibold">
              <label htmlFor={`${id}-state`}>State</label>
              <Combobox
                id={`${id}-state`}
                value={draft.region ? String(draft.region) : ""}
                onChange={(value) => change({ region: num(value), city: null })}
                options={regionChoices}
                placeholder="All states"
                noMatch={() => "No state matches"}
                className="font-normal"
              />
            </div>
            <div className="flex flex-col gap-1.5 text-sm font-semibold">
              <label htmlFor={`${id}-city`}>City</label>
              <Combobox
                id={`${id}-city`}
                value={draft.city ? String(draft.city) : ""}
                onChange={(value) => change({ city: num(value) })}
                options={cityChoices}
                placeholder="All cities"
                disabled={!draft.region}
                noMatch={() => "No city in this state matches"}
                className="font-normal"
              />
            </div>
          </div>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Country (works in)
          <select
            value={draft.country ?? ""}
            onChange={(e) => change({ country: e.target.value || null })}
            className={cn(selectClass, "font-normal")}
          >
            <option value="">All countries</option>
            {options.countries.map((c) => (
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
            {options.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      {options.nationalities && (
        <div className="flex flex-col gap-1.5 text-sm font-semibold">
          <label htmlFor={`${id}-nationality`}>Nationality</label>
          <Combobox
            id={`${id}-nationality`}
            value={draft.nationality ?? ""}
            onChange={(value) => change({ nationality: value || null })}
            options={nationalityChoices}
            placeholder="All nationalities"
            noMatch={() => "No nationality matches"}
            describedBy={`${id}-nationality-note`}
            className="font-normal"
          />
          <p
            id={`${id}-nationality-note`}
            className="text-xs font-normal text-graphite"
          >
            Someone with two nationalities matches either one.
          </p>
        </div>
      )}
    </>
  );
}
