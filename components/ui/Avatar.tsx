import { cn } from "@/lib/cn";

export type AvatarProps = {
  name: string;
  /** sand = on black top bar; ink = on light surfaces. */
  tone?: "sand" | "ink";
  size?: "sm" | "md" | "lg";
  /** Set when the person's name is already shown next to the avatar. */
  decorative?: boolean;
  className?: string;
};

/** "Raju Bholani" → "RB", "Moises" → "M". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase();
}

const sizes = {
  sm: "size-[30px] text-[11px]",
  md: "size-[34px] text-xs",
  lg: "size-14 text-lg",
} as const;

export function Avatar({
  name,
  tone = "sand",
  size = "sm",
  decorative = false,
  className,
}: AvatarProps) {
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-pill font-bold",
        tone === "sand" ? "bg-sand text-ink" : "bg-ink text-paper",
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
