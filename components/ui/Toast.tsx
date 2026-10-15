"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { CheckIcon, CloseIcon } from "./icons";

/**
 * A short message at the bottom of the screen ("Draft saved"), announced to
 * screen readers; it closes by itself after `duration` ms, or with ×. On a
 * phone it sits above the sticky button bar.
 */
export function Toast({
  tone = "ok",
  children,
  onClose,
  duration = 4000,
}: {
  tone?: "ok" | "error";
  children: React.ReactNode;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg md:bottom-6",
        tone === "error" ? "bg-signal text-paper" : "bg-ink text-paper",
      )}
    >
      {tone === "ok" && (
        <span
          aria-hidden="true"
          className="flex size-5.5 shrink-0 items-center justify-center rounded-pill bg-paper text-ink"
        >
          <CheckIcon size={12} />
        </span>
      )}
      <span className="flex-1">{children}</span>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="-my-2 -mr-2 flex size-11 shrink-0 items-center justify-center"
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
