"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { InlineError } from "./InlineError";

export type TextFieldProps = Omit<ComponentProps<"input">, "size"> & {
  label: string;
  /** Helper text under the field. */
  hint?: ReactNode;
  /** Error message; marks the field invalid and links the message. */
  error?: ReactNode;
  /** Visual size: md = 44px (forms), lg = 50px (sign-in). */
  fieldSize?: "md" | "lg";
  /** Extra element inside the field on the right (e.g. show-password button). */
  endAdornment?: ReactNode;
  /** Extra element on the right of the label row (e.g. "Forgot password?"). */
  labelAside?: ReactNode;
  /** Extra classes for the <input> itself (e.g. large spaced digits for codes). */
  inputClassName?: string;
};

/** Labelled text input with hint, error and read-only states. */
export function TextField({
  label,
  hint,
  error,
  fieldSize = "md",
  endAdornment,
  labelAside,
  inputClassName,
  id,
  required,
  readOnly,
  className,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-[13px] font-semibold text-ink">
          {label}
          {required && (
            <span aria-hidden="true" className="text-signal">
              {" "}
              *
            </span>
          )}
        </label>
        {labelAside}
      </div>

      <div
        className={cn(
          "flex items-center rounded-field",
          readOnly ? "bg-sand" : "bg-paper",
          error
            ? "border-2 border-signal"
            : readOnly
              ? "border border-transparent"
              : "border border-field-border focus-within:border-ink",
        )}
      >
        <input
          id={inputId}
          required={required}
          readOnly={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "min-w-0 flex-1 bg-transparent px-4 text-[15px] outline-none",
            fieldSize === "lg" ? "h-12" : "h-10.5",
            readOnly && "text-graphite",
            inputClassName,
          )}
          {...props}
        />
        {endAdornment && <div className="pr-1.5">{endAdornment}</div>}
      </div>

      {error && <InlineError id={errorId}>{error}</InlineError>}
      {hint && (
        <p id={hintId} className="text-xs text-graphite">
          {hint}
        </p>
      )}
    </div>
  );
}
