"use client";

import type { KeyboardEvent } from "react";
import { Button, CloseIcon } from "@/components/ui";
import { cn } from "@/lib/cn";

export const fieldClass =
  "h-12 min-w-0 rounded-field border border-field-border bg-paper px-3 text-base outline-none focus:border-ink md:h-10 md:text-sm";

/** Toggle chips for the allowed actions, kept in the list's own order. */
export function ActionToggles({
  all,
  value,
  onChange,
  hint,
}: {
  all: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  hint: string;
}) {
  const toggle = (action: string) =>
    onChange(
      value.includes(action)
        ? value.filter((a) => a !== action)
        : all.filter((a) => a === action || value.includes(a)),
    );
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-1.5 text-[13px] font-semibold">
        Allowed actions
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {all.map((action) => {
          const on = value.includes(action);
          return (
            <button
              key={action}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(action)}
              className={cn(
                "h-10 rounded-pill border px-3.5 text-[13px] font-semibold",
                on
                  ? "border-ink bg-ink text-paper"
                  : "border-field-border bg-paper",
              )}
            >
              {action}
            </button>
          );
        })}
      </div>
      <span className="text-xs text-graphite">{hint}</span>
    </fieldset>
  );
}

/**
 * Free options as removable chips plus a box to add one (button or Enter).
 * `draft` is lifted so Save can include what is still typed in the box.
 */
export function OptionChips({
  legend,
  inputLabel,
  placeholder,
  hint,
  value,
  onChange,
  draft,
  onDraftChange,
}: {
  legend: string;
  inputLabel: string;
  placeholder: string;
  hint: string;
  value: string[];
  onChange: (next: string[]) => void;
  draft: string;
  onDraftChange: (next: string) => void;
}) {
  const add = () => {
    const item = draft.trim().replace(/\s+/g, " ");
    if (!item) return;
    if (!value.some((v) => v.toLowerCase() === item.toLowerCase())) {
      onChange([...value, item]);
    }
    onDraftChange("");
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      add();
    }
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-1.5 text-[13px] font-semibold">{legend}</legend>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((item) => (
            <li
              key={item}
              className="flex h-9 items-center gap-1 rounded-pill bg-sand pr-1 pl-3 text-[13px] font-semibold"
            >
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(value.filter((v) => v !== item))}
                className="flex size-7 items-center justify-center"
              >
                <CloseIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          aria-label={inputLabel}
          placeholder={placeholder}
          value={draft}
          maxLength={40}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKey}
          className={fieldClass}
        />
        <Button variant="secondary" size="sm" onClick={add}>
          Add
        </Button>
      </div>
      <span className="text-xs text-graphite">{hint}</span>
    </fieldset>
  );
}

/** Lists with what is still typed in the "add" box, so Save keeps it. */
export function withDraft(value: string[], draft: string): string[] {
  return draft.trim() ? [...value, draft] : value;
}
