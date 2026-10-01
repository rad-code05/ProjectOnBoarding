import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { LockIcon } from "./icons";

export type NoticeProps = {
  /** info = quiet graphite note; ai = dashed outline + AI chip for assistant suggestions. */
  tone?: "info" | "ai";
  icon?: ReactNode;
  /** Buttons shown on the right (ai tone). */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function Notice({
  tone = "info",
  icon,
  actions,
  className,
  children,
}: NoticeProps) {
  if (tone === "ai") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-[12px] border-[1.5px] border-dashed border-ink bg-paper px-4 py-3",
          className,
        )}
      >
        <span className="rounded-pill bg-suggest px-2 py-1 text-[11px] font-bold text-ink">
          AI
        </span>
        <div className="flex-1 text-sm leading-snug">{children}</div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 text-[13px] leading-relaxed text-graphite",
        className,
      )}
    >
      <span className="mt-0.5 shrink-0">{icon ?? <LockIcon />}</span>
      <div>{children}</div>
    </div>
  );
}
