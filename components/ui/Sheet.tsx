"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons";
import { IconButton } from "./IconButton";

/**
 * Bottom sheet on a phone, centred window on desktop. A native <dialog>
 * opened with showModal(): focus stays inside, Esc closes, the page behind
 * can't be clicked (design: Phone · Edit an app / Add equipment).
 */
export function Sheet({
  eyebrow,
  title,
  onClose,
  children,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[90dvh] w-full max-w-none rounded-t-[20px] bg-paper p-0 text-ink backdrop:bg-ink/45 md:inset-0 md:m-auto md:max-w-md md:rounded-[18px]"
    >
      <div className="flex flex-col gap-4.5 px-4 pt-2.5 pb-6 md:p-6">
        <span
          aria-hidden="true"
          className="h-1 w-10 self-center rounded-pill bg-field-border md:hidden"
        />
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
              {eyebrow}
            </span>
            <h2 id={titleId} className="font-serif text-[28px] leading-tight">
              {title}
            </h2>
          </div>
          <IconButton label="Close" icon={<CloseIcon />} onClick={onClose} />
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Pill classes for the radio choices inside a sheet. */
export function sheetPill(on: boolean, extra?: string) {
  return [
    "flex h-11 cursor-pointer items-center justify-center rounded-pill text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink",
    on ? "font-bold" : "font-medium",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}
