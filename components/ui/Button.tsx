import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "text" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a busy state and blocks clicks while an action is running. */
  loading?: boolean;
  fullWidth?: boolean;
  iconLeft?: ReactNode;
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-paper hover:bg-graphite",
  secondary: "border border-ink bg-transparent text-ink hover:bg-paper",
  text: "bg-transparent px-2 text-ink underline underline-offset-2 hover:text-signal",
  destructive: "border border-signal bg-transparent text-signal hover:bg-paper",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-xs",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-6 text-[15px]",
};

/** Pill-button classes, also for links that look like buttons (e.g. "Go to my start page"). */
export function buttonStyles(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
) {
  return cn(
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill font-semibold tracking-[0.01em] transition-colors",
    sizes[size],
    variants[variant],
  );
}

/** Pill button — see the Components board and design/components.md. */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  iconLeft,
  type = "button",
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        buttonStyles(variant, size),
        isDisabled &&
          "cursor-not-allowed border-transparent bg-line text-graphite no-underline hover:bg-line",
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {iconLeft}
      <span>{children}</span>
      {loading && <span className="sr-only">(working…)</span>}
    </button>
  );
}
