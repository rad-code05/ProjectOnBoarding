"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  REQUEST_STATES,
  REQUEST_TYPES,
  STATE_LABELS,
  TYPE_LABELS,
  countryName,
} from "@/lib/requests/labels";

const SEARCH_DELAY_MS = 300;

const selectClass =
  "h-11 min-w-0 rounded-pill border border-field-border bg-paper px-3 text-base text-ink md:h-[38px] md:text-xs";

/**
 * Search and filters for the requests list. They live in the URL
 * (?q=&type=&status=&country=), so a filtered view can be bookmarked and the
 * Back button works; the server reads them and runs the query.
 */
export function RequestFilters({ countries }: { countries: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const lastPushedQ = useRef(params.get("q") ?? "");

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("limit"); // a new filter starts from the first page
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  // Search after a short pause in typing, not on every key.
  useEffect(() => {
    if (q.trim() === lastPushedQ.current) return;
    const timer = setTimeout(() => {
      lastPushedQ.current = q.trim();
      update({ q: q.trim() });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  });

  const type = params.get("type") ?? "";

  return (
    <div className="flex flex-col gap-2.5 md:flex-row md:flex-wrap md:items-center">
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
          placeholder="Search name, email or ticket"
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-stone md:text-xs"
        />
      </label>

      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div
          role="radiogroup"
          aria-label="Ticket type"
          className="inline-flex gap-[3px] rounded-pill border border-line bg-paper p-[3px] whitespace-nowrap"
        >
          {[
            ["", "All"] as const,
            ...REQUEST_TYPES.map((t) => [t, TYPE_LABELS[t]] as const),
          ].map(([value, label]) => {
            const checked = type === value;
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => update({ type: value })}
                className={cn(
                  "h-[38px] cursor-pointer rounded-pill px-3.5 text-[13px] md:h-[30px] md:px-3 md:text-xs",
                  checked
                    ? "bg-ink font-semibold text-paper"
                    : "font-medium hover:bg-sand",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:flex">
        <select
          aria-label="Status"
          value={params.get("status") ?? ""}
          onChange={(event) => update({ status: event.target.value })}
          className={selectClass}
        >
          <option value="">All statuses</option>
          {REQUEST_STATES.map((state) => (
            <option key={state} value={state}>
              {STATE_LABELS[state]}
            </option>
          ))}
        </select>
        <select
          aria-label="Country"
          value={params.get("country") ?? ""}
          onChange={(event) => update({ country: event.target.value })}
          className={selectClass}
        >
          <option value="">All countries</option>
          {countries.map((code) => (
            <option key={code} value={code}>
              {countryName(code)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
