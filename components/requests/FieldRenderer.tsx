"use client";

import { useId } from "react";
import { InlineError } from "@/components/ui";
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
};

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
}: FieldRendererProps) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const hintId = field.help_text ? `${id}-hint` : undefined;

  if (field.field_type === "system") {
    return (
      <div className={cn("flex flex-col gap-1.5", phoneSpan(field))}>
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
      [errorId, hintId].filter(Boolean).join(" ") || undefined,
    className: cn(control, border, disabled && "bg-sand text-graphite"),
  };
  const isSelect = ["select", "department", "country", "user"].includes(
    field.field_type,
  );

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", phoneSpan(field))}>
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
      {error && <InlineError id={errorId}>{error}</InlineError>}
      {field.help_text && (
        <p id={hintId} className="text-xs text-graphite md:text-[11px]">
          {field.help_text}
        </p>
      )}
    </div>
  );
}
