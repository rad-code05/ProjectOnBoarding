import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type IconButtonVariant = "outline" | "solid" | "ghost" | "dark";

export type IconButtonProps = Omit<ComponentProps<"button">, "children"> & {
  /** Required: what the button does, read by screen readers. */
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: "sm" | "md";
};

const variants: Record<IconButtonVariant, string> = {
  outline: "border border-line bg-paper text-ink hover:border-ink",
  solid: "bg-ink text-paper hover:bg-graphite",
  ghost: "bg-transparent text-ink hover:bg-sand",
  /** For use on black surfaces such as the top bar. */
  dark: "border border-divider-dark bg-ink text-paper hover:border-stone",
};

/** Round icon-only button. Always has an accessible name via `label`. */
export function IconButton({
  label,
  icon,
  variant = "outline",
  size = "md",
  type = "button",
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-pill transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "size-8" : "size-10",
        variants[variant],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
