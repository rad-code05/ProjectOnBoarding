"use client";

import { useId } from "react";
import { Combobox, InlineError } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Choice, FormField } from "@/lib/requests/fields";

export type FieldRendererProps = {
  field: FormField;
  /** Current text value (editable fields) or the display value (system fields). */
  value: string;
  onChange?: (value: string) => void;
  /** Choices for select, department, country and user fields. */
  choices?: Choice[];
  error?: string;
  disabled?: boolean;
  /** Access change (F10c): the value on the previous request, when it changed. */
  was?: string | null;
  /** Searchable lists: text when nothing matches (e.g. "No city in Texas matches"). */
  noMatch?: (query: string) => string;
  /** Searchable lists: offer to add what was typed (admins adding a city). */
  create?: {
    label: (query: string) => string;
    onCreate: (query: string) => void;
  };
};

/** Field types drawn as a searchable drop-down (F27, 2026-10-21). */
const SEARCHABLE = new Set(["country", "office", "region", "office_city"]);
/** At most this many nationalities (database check). */
const MAX_NATIONALITIES = 2;

/** Pairs that sit side by side on a phone; other text fields take the full width. */
const PHONE_PAIRS = new Set(["first_name", "last_name"]);

/**
 * On a phone, text and email fields take both columns (names excepted);
 * selects, dates and system values take one. Desktop: one grid cell each.
 */
export function phoneSpan(field: FormField): string {
  const wide =
    (field.field_type === "text" || field.field_type === "email") &&
    !PHONE_PAIRS.has(field.key);
  return wide ? "col-span-2 md:col-span-1" : "col-span-1";
}

// 48px / 16px on phones (16px stops iPhone zooming into the field), denser on desktop.
const control =
  "h-12 w-full min-w-0 rounded-field bg-paper px-3 text-base text-ink outline-none md:h-9 md:text-[13px]";

/**
 * One form field, drawn from its form_fields row: the field type decides the
 * control, so a field added in Admin (F21) needs no code change.
 */
export function FieldRenderer({
  field,
  value,
  onChange,
  choices = [],
  error,
  disabled,
  was,
  noMatch,
  create,
}: FieldRendererProps) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const hintId = field.help_text ? `${id}-hint` : undefined;
  const wasId = was ? `${id}-was` : undefined;

  if (field.field_type === "system") {
    return (
      <div
        className={cn("flex flex-col gap-1.5", phoneSpan(field))}
        data-field-label={field.label}
      >
        <span id={id} className="text-xs font-semibold md:text-[11px]">
          {field.label}
        </span>
        <div
          aria-labelledby={id}
          role="group"
          className="flex h-12 items-center truncate rounded-field bg-sand px-3 text-sm text-graphite md:h-9 md:text-xs"
        >
          {value}
        </div>
      </div>
    );
  }

  const border = error
    ? "border-2 border-signal"
    : "border border-field-border focus:border-ink";
  const shared = {
    id,
    disabled,
    "aria-invalid": error ? true : undefined,
    "aria-describedby":
      [errorId, hintId, wasId].filter(Boolean).join(" ") || undefined,
    className: cn(control, border, disabled && "bg-sand text-graphite"),
  };
  const isSelect = ["select", "department", "user"].includes(field.field_type);
  const describedBy =
    [errorId, hintId, wasId].filter(Boolean).join(" ") || undefined;
  const notes = (
    <>
      {error && <InlineError id={errorId}>{error}</InlineError>}
      {field.help_text && (
        <p id={hintId} className="text-xs text-graphite md:text-[11px]">
          {field.help_text}
        </p>
      )}
      {was && (
        <p id={wasId} className="text-xs text-graphite md:text-[11px]">
          Was: {was}
        </p>
      )}
    </>
  );

  if (SEARCHABLE.has(field.field_type)) {
    return (
      <div
        className={cn("flex min-w-0 flex-col gap-1.5", phoneSpan(field))}
        data-field-label={field.label}
      >
        <label htmlFor={id} className="text-xs font-semibold md:text-[11px]">
          {field.label}
        </label>
        <Combobox
          id={id}
          value={value}
          onChange={(next) => onChange?.(next)}
          options={choices}
          disabled={disabled}
          invalid={Boolean(error)}
          describedBy={describedBy}
          allowEmpty={!field.required}
          noMatch={noMatch}
          create={create}
        />
        {notes}
      </div>
    );
  }

  if (field.field_type === "nationality") {
    const chosen = value.split(",").filter(Boolean);
    const set = (codes: string[]) => onChange?.(codes.join(","));
    const name = (code: string) =>
      choices.find((c) => c.value === code)?.label ?? code;
    return (
      <div
        className={cn("flex min-w-0 flex-col gap-1.5", phoneSpan(field))}
        data-field-label={field.label}
      >
        <label htmlFor={id} className="text-xs font-semibold md:text-[11px]">
          {field.label}
        </label>
        {/* The search box first, so it lines up with the boxes beside it. */}
        {chosen.length < MAX_NATIONALITIES ? (
          <Combobox
            id={id}
            value=""
            onChange={(code) => code && set([...chosen, code])}
            options={choices.filter((c) => !chosen.includes(c.value))}
            disabled={disabled}
            invalid={Boolean(error)}
            describedBy={describedBy}
            allowEmpty={false}
            placeholder={
              chosen.length ? "Add a second one…" : "Type to search…"
            }
          />
        ) : (
          <p id={id} className="text-xs text-graphite md:text-[11px]">
            Two chosen — remove one to change.
          </p>
        )}
        {chosen.length > 0 && (
          <ul
            className="flex flex-wrap gap-1.5"
            aria-label={`${field.label} chosen`}
          >
            {chosen.map((code) => (
              <li
                key={code}
                className="flex h-9 items-center gap-1 rounded-pill bg-sand pr-1 pl-3 text-[13px] font-semibold"
              >
                {name(code)}
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Remove ${name(code)}`}
                    onClick={() => set(chosen.filter((c) => c !== code))}
                    className="flex size-7 items-center justify-center"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {notes}
      </div>
    );
  }

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-1.5", phoneSpan(field))}
      data-field-label={field.label}
    >
      <label htmlFor={id} className="text-xs font-semibold md:text-[11px]">
        {field.label}
      </label>
      {isSelect ? (
        <select
          {...shared}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        >
          {field.field_type !== "select" && <option value="">Choose…</option>}
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...shared}
          type={field.field_type === "text" ? "text" : field.field_type}
          autoComplete="off"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        />
      )}
      {notes}
    </div>
  );
}
