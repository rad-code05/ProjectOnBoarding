"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { loadMoreAudit } from "@/app/(app)/audit/actions";
import {
  Avatar,
  Button,
  CloseIcon,
  DownloadIcon,
  InlineError,
  buttonStyles,
} from "@/components/ui";
import {
  AUDIT_PAGE_SIZE,
  AUDIT_SOURCES,
  SOURCE_LABELS,
  auditParams,
  filterChips,
  type AuditFilters,
} from "@/lib/audit/filters";
import type { AuditEntry, AuditPage, AuditPerson } from "@/lib/audit/log";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/requests/format";
import { AuditEventSheet } from "./AuditEventSheet";
import { AuditFiltersSheet } from "./AuditFiltersSheet";
import { dayHeading, zoneCity } from "./time";

const SEARCH_DELAY_MS = 300;
/** export_audit_log() returns at most this many events. */
const EXPORT_LIMIT = 10_000;

const chipStyle: Record<AuditEntry["chip"], string> = {
  People: "border border-ink",
  AI: "bg-suggest",
  System: "bg-line-subtle text-graphite",
};

/** Consecutive events of the same day, for the day headings. */
function byDay(entries: AuditEntry[], timeZone: string) {
  const days: { heading: string; entries: AuditEntry[] }[] = [];
  for (const entry of entries) {
    const heading = dayHeading(entry.at, timeZone);
    const last = days.at(-1);
    if (last?.heading === heading) last.entries.push(entry);
    else days.push({ heading, entries: [entry] });
  }
  return days;
}

/**
 * The audit log (board: Phone · Audit log): search, source pills, filters
 * sheet + active filters as chips, events grouped by day in plain words,
 * details sheet, "Show 30 more". Filters live in the URL; the server loads
 * the first page, more pages come from a server action.
 */
export function AuditLog({
  filters,
  initial,
  people,
  timeZone,
}: {
  filters: AuditFilters;
  initial: AuditPage;
  people: AuditPerson[];
  timeZone: string;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initial.entries);
  const [next, setNext] = useState(initial.next);
  // New filters → the server sends a new first page: start the list again.
  const [shownPage, setShownPage] = useState(initial);
  if (shownPage !== initial) {
    setShownPage(initial);
    setEntries(initial.entries);
    setNext(initial.next);
  }
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [error, setError] = useState(false);
  const [loading, startLoading] = useTransition();
  const [q, setQ] = useState(filters.q);
  const lastQ = useRef(filters.q);

  const apply = (patch: Partial<AuditFilters>) => {
    const query = auditParams({ ...filters, ...patch }).toString();
    router.replace(query ? `/audit?${query}` : "/audit", { scroll: false });
  };

  // Search after a short pause in typing, not on every key.
  useEffect(() => {
    if (q.trim() === lastQ.current) return;
    const timer = setTimeout(() => {
      lastQ.current = q.trim();
      apply({ q: q.trim() });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  });

  const names = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const chips = filterChips(filters, names);
  const total = initial.total;

  const showMore = () => {
    if (!next) return;
    setError(false);
    startLoading(async () => {
      const page = await loadMoreAudit(auditParams(filters).toString(), next);
      if (!page) {
        setError(true);
        return;
      }
      setEntries((shown) => [...shown, ...page.entries]);
      setNext(page.next);
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
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
          aria-label="Search people, tickets or details"
          placeholder="Search people, tickets or details"
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-stone md:text-xs"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label="Source"
          className="inline-flex gap-[3px] rounded-pill border border-line bg-paper p-[3px]"
        >
          {[null, ...AUDIT_SOURCES].map((source) => {
            const checked = filters.source === source;
            return (
              <button
                key={source ?? "all"}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => apply({ source })}
                className={cn(
                  "h-9 cursor-pointer rounded-pill px-3 text-[13px] md:h-[30px] md:text-xs",
                  checked
                    ? "bg-ink font-semibold text-paper"
                    : "font-medium hover:bg-sand",
                )}
              >
                {source ? SOURCE_LABELS[source] : "All"}
              </button>
            );
          })}
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="ml-auto h-[42px] md:h-9"
          onClick={() => setFiltersOpen(true)}
        >
          Filters{chips.length ? ` · ${chips.length}` : ""}
        </Button>
      </div>

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

      <span className="text-xs font-semibold text-graphite">
        {total} event{total === 1 ? "" : "s"} · newest first · times in{" "}
        {zoneCity(timeZone)}
      </span>

      {entries.length === 0 ? (
        <div className="flex flex-col gap-1.5 rounded-card border border-line bg-paper p-5">
          <h2 className="font-serif text-xl">No events match</h2>
          <p className="text-sm text-graphite">
            Try another search, a longer period or fewer filters.
          </p>
        </div>
      ) : (
        byDay(entries, timeZone).map((day) => (
          <section key={day.heading} className="flex flex-col gap-1.5">
            <h2 className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
              {day.heading}
            </h2>
            <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-paper">
              {day.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="border-b border-line-subtle last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => setOpen(entry)}
                    className="flex w-full cursor-pointer items-start gap-2.5 px-3.5 py-3 text-left hover:bg-sand"
                  >
                    {entry.chip === "System" ? (
                      <span
                        aria-hidden="true"
                        className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-pill bg-line-subtle text-[11px] font-bold text-graphite"
                      >
                        SY
                      </span>
                    ) : (
                      <Avatar name={entry.who} tone="ink" decorative />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm leading-snug">
                        <strong>{entry.who}</strong> {entry.what}
                      </span>
                      <span className="truncate text-xs text-graphite">
                        {[
                          formatTime(entry.at, timeZone),
                          entry.context ?? entry.record,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-semibold",
                        chipStyle[entry.chip],
                      )}
                    >
                      {entry.chip}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {error && (
        <InlineError>Could not load more events. Try again.</InlineError>
      )}
      {next && entries.length < total && (
        <Button
          variant="secondary"
          loading={loading}
          onClick={showMore}
          className="w-full md:w-auto md:self-start"
        >
          Show {Math.min(AUDIT_PAGE_SIZE, total - entries.length)} more
        </Button>
      )}

      {total > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-line pt-4">
          {/* A plain link (never prefetched): every export is recorded. */}
          <a
            href={`/audit/export?${auditParams(filters)}`}
            download
            className={`${buttonStyles("primary", "md")} w-full md:w-auto md:self-start`}
          >
            <DownloadIcon size={16} />
            {total > EXPORT_LIMIT
              ? `Export the newest ${EXPORT_LIMIT.toLocaleString("en-GB")} events (CSV)`
              : `Export ${total === 1 ? "this event" : `these ${total} events`} (CSV)`}
          </a>
          <p className="text-xs leading-normal text-graphite">
            The export follows the filters above and is itself recorded in the
            audit log.
          </p>
        </div>
      )}

      {open && (
        <AuditEventSheet
          entry={open}
          timeZone={timeZone}
          onClose={() => setOpen(null)}
        />
      )}
      {filtersOpen && (
        <AuditFiltersSheet
          filters={filters}
          people={people}
          onClose={() => setFiltersOpen(false)}
          onApply={(nextFilters) => {
            setFiltersOpen(false);
            apply(nextFilters);
          }}
        />
      )}
    </div>
  );
}
