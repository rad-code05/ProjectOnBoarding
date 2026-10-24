"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

export type ComboboxOption = { value: string; label: string };

/** Lower case, accents dropped ("Zürich" → "zurich"), for matching. */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** Options whose label contains the typed letters anywhere ("york" → New York). */
export function filterOptions(
  options: ComboboxOption[],
  query: string,
): ComboboxOption[] {
  const q = foldText(query);
  if (!q) return options;
  return options.filter((o) => foldText(o.label).includes(q));
}

/** At most this many rows are drawn; typing narrows the rest. */
const SHOWN = 60;

export type ComboboxProps = {
  id?: string;
  /** The chosen option's value ("" = none). */
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  /** Offer a clear (×) button when something is chosen. */
  allowEmpty?: boolean;
  /** Shown when nothing matches (e.g. "No city in Florida matches"). */
  noMatch?: (query: string) => string;
  /**
   * Offer to add what was typed when nothing matches exactly — e.g.
   * "Add “Miami” to Florida" (admins only; the caller decides).
   */
  create?: {
    label: (query: string) => string;
    onCreate: (query: string) => void;
  };
  className?: string;
  /** Accessible name when there is no <label for>. */
  ariaLabel?: string;
};

/**
 * A searchable drop-down (WAI-ARIA combobox with a list): type a few letters
 * and the list narrows; ↓ ↑ move, Enter picks, Esc closes. Shows the chosen
 * option's name while closed. 16 px on phones so iPhone doesn't zoom.
 */
export function Combobox({
  id: givenId,
  value,
  onChange,
  options,
  placeholder = "Type to search…",
  disabled,
  invalid,
  describedBy,
  allowEmpty = true,
  noMatch = () => "Nothing matches",
  create,
  className,
  ariaLabel,
}: ComboboxProps) {
  const autoId = useId();
  const id = givenId ?? autoId;
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = options.find((o) => o.value === value) ?? null;
  const matches = useMemo(
    () => filterOptions(options, query),
    [options, query],
  );
  const shown = matches.slice(0, SHOWN);
  const exact = matches.some((o) => foldText(o.label) === foldText(query));
  const offerCreate = Boolean(create && query.trim() && !exact);
  const rows = shown.length + (offerCreate ? 1 : 0);

  const openList = () => {
    if (disabled) return;
    setQuery("");
    setActive(
      Math.max(
        0,
        shown.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const pick = (option: ComboboxOption) => {
    onChange(option.value);
    close();
  };
  const choose = (index: number) => {
    if (index < shown.length) pick(shown[index]);
    else if (offerCreate && create) {
      create.onCreate(query.trim());
      close();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openList();
      else setActive((i) => Math.min(i + 1, Math.max(rows - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      if (open && rows > 0) {
        event.preventDefault();
        choose(active);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        close();
      }
    }
  };

  const optionId = (index: number) => `${id}-opt-${index}`;

  return (
    <div className={cn("relative min-w-0", className)}>
      <div
        className={cn(
          "flex h-12 min-w-0 items-center gap-1.5 rounded-field bg-paper pr-2.5 pl-3 md:h-9",
          invalid
            ? "border-2 border-signal"
            : open
              ? "border-2 border-ink"
              : "border border-field-border",
          disabled && "bg-sand",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && rows > 0 ? optionId(active) : undefined
          }
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-label={ariaLabel}
          autoComplete="off"
          disabled={disabled}
          placeholder={open ? placeholder : selected ? undefined : "Choose…"}
          value={open ? query : (selected?.label ?? "")}
          onFocus={openList}
          onClick={() => !open && openList()}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            if (!open) setOpen(true);
          }}
          onBlur={close}
          onKeyDown={onKeyDown}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-stone md:text-[13px]",
            disabled && "text-graphite",
          )}
        />
        {allowEmpty && selected && !disabled && !open && (
          <button
            type="button"
            aria-label="Clear"
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange("")}
            className="flex size-7 items-center justify-center text-graphite"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <path d={open ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
        </svg>
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-30 mt-1 flex max-h-64 flex-col gap-0.5 overflow-auto rounded-xl border border-field-border bg-paper p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          {shown.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(option)}
              onMouseEnter={() => setActive(index)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center rounded-lg px-2.5 text-sm md:min-h-9 md:text-[13px]",
                index === active && "bg-sand",
                option.value === value && "font-bold",
              )}
            >
              {option.label}
            </li>
          ))}
          {matches.length > SHOWN && (
            <li className="px-2.5 py-1.5 text-xs text-graphite">
              {matches.length - SHOWN} more — keep typing to narrow the list
            </li>
          )}
          {shown.length === 0 && (
            <li className="px-2.5 py-2 text-sm text-graphite">
              {noMatch(query)}
            </li>
          )}
          {offerCreate && create && (
            <li
              id={optionId(shown.length)}
              role="option"
              aria-selected={false}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(shown.length)}
              onMouseEnter={() => setActive(shown.length)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-sm font-bold md:min-h-9 md:text-[13px]",
                active === shown.length && "bg-sand",
              )}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              {create.label(query.trim())}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
