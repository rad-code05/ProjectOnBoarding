import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AlertIcon } from "./icons";

export type InlineErrorProps = {
  /** Referenced by the field's aria-describedby. */
  id?: string;
  /** Announce immediately (for form-level errors that appear after submit). */
  live?: boolean;
  className?: string;
  children: ReactNode;
};

/** Signal-red message with icon — never colour alone. */
export function InlineError({
  id,
  live,
  className,
  children,
}: InlineErrorProps) {
  return (
    <p
      id={id}
      role={live ? "alert" : undefined}
      className={cn(
        "flex items-center gap-2 text-[13px] font-semibold text-signal",
        className,
      )}
    >
      <AlertIcon className="shrink-0" />
      <span>{children}</span>
    </p>
  );
}
