"use client";

import Link from "next/link";
import { useState } from "react";
import type { ActivityEntry } from "@/lib/audit/timeline";
import { cn } from "@/lib/cn";
import { formatDayTime } from "@/lib/requests/format";

const FIRST = 8;

const dots: Record<ActivityEntry["dot"], string> = {
  key: "bg-ink",
  return: "border-2 border-signal bg-paper",
  step: "border-2 border-ink bg-paper",
};

/**
 * Everything that happened to one request, newest first (board: Request
 * activity): signatures and the confirmation as black dots, a return as a
 * red ring with its comment, notes for the approver shown.
 */
export function RequestActivity({
  entries,
  timeZone,
  showAuditLink = false,
  className,
}: {
  entries: ActivityEntry[];
  timeZone: string;
  /** Admins and auditors: a way into the full audit log. */
  showAuditLink?: boolean;
  className?: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? entries : entries.slice(0, FIRST);
  const earlier = entries.length - shown.length;

  return (
    <section
      aria-labelledby="activity-heading"
      className={cn(
        "flex flex-col gap-3 rounded-card border border-line bg-paper p-4",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="activity-heading" className="font-serif text-xl">
          Activity
        </h2>
        <span className="text-xs text-graphite">
          {entries.length} event{entries.length === 1 ? "" : "s"} · newest first
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-graphite">Nothing recorded yet.</p>
      ) : (
        <ol className="flex flex-col">
          {shown.map((entry, i) => (
            <li key={entry.id} className="flex gap-3">
              <span className="flex w-3 shrink-0 flex-col items-center">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1 size-3 shrink-0 rounded-pill",
                    dots[entry.dot],
                  )}
                />
                {i < shown.length - 1 && (
                  <span aria-hidden="true" className="w-px flex-1 bg-line" />
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-4">
                <p
                  className={cn(
                    "text-sm leading-snug",
                    entry.dot === "return" && "text-signal",
                  )}
                >
                  <strong>{entry.who}</strong> {entry.what}
                </p>
                <p className="text-xs text-graphite">
                  {[formatDayTime(entry.at, timeZone), entry.context]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {entry.note && (
                  <p className="mt-1 rounded-[10px] bg-sand px-3 py-2 text-[13px] leading-normal break-words">
                    {entry.note}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {earlier > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="self-start text-sm font-semibold underline underline-offset-2"
        >
          Show {earlier} earlier event{earlier === 1 ? "" : "s"}
        </button>
      )}
      <p className="text-xs leading-normal text-graphite">
        Everything that happened to this request, from the audit log.{" "}
        {showAuditLink ? (
          <Link href="/audit" className="underline">
            Open the full audit log
          </Link>
        ) : (
          "Admins and auditors can open the full audit log."
        )}
      </p>
    </section>
  );
}
