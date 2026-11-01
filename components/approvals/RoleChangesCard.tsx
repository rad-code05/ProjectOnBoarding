"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  loadOlderRoleChanges,
  markRoleChangesSeen,
} from "@/app/(app)/approvals/actions";
import { Button } from "@/components/ui";
import type { RoleChangesPage } from "@/lib/approvals/role-changes";
import { cn } from "@/lib/cn";

type Line = RoleChangesPage["lines"][number];

/**
 * Role changes (board: Phone · Approvals · Role changes — D5): every approver
 * sees who was invited, given or lost a role, or (de)activated. "N new" =
 * since they last looked; opening the page marks them seen (the badge stays
 * for this visit).
 */
export function RoleChangesCard({
  lines: first,
  older,
}: {
  lines: Line[];
  /** Where Show older continues, or null. */
  older: string | null;
}) {
  const [lines, setLines] = useState(first);
  const [cursor, setCursor] = useState(older);
  const [pending, start] = useTransition();
  const marked = useRef(false);
  const fresh = first.filter((l) => l.isNew).length;

  useEffect(() => {
    if (marked.current || fresh === 0) return;
    marked.current = true;
    void markRoleChangesSeen();
  }, [fresh]);

  const more = () =>
    start(async () => {
      if (!cursor) return;
      const page = await loadOlderRoleChanges({ before: cursor });
      setLines((current) => [
        ...current,
        ...page.lines.filter((l) => !current.some((c) => c.key === l.key)),
      ]);
      setCursor(page.before);
    });

  return (
    <section
      aria-labelledby="role-changes-title"
      className="flex flex-col gap-3 rounded-card border border-ink bg-paper p-3.5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2
          id="role-changes-title"
          className="font-serif text-[22px] md:text-[24px]"
        >
          Role changes
        </h2>
        {fresh > 0 && (
          <span className="inline-flex h-5.5 items-center rounded-pill bg-ink px-2.5 text-[11px] font-bold text-paper">
            {fresh} new
          </span>
        )}
      </div>
      <p className="text-xs leading-normal text-graphite">
        Who was invited, given or lost a role, or deactivated — last 30 days.
        Shown to every approver so admin changes never go unseen.
      </p>
      <ol aria-label="Role changes" className="flex flex-col">
        {lines.map((line) => (
          <li
            key={line.key}
            className="flex items-start gap-2.5 border-t border-line-subtle py-2.5"
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-pill border border-ink",
                line.isNew ? "bg-ink" : "bg-paper",
              )}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm leading-snug">
                <b>{line.who}</b> {line.what}
                {line.isNew && <span className="sr-only"> (new)</span>}
              </span>
              <span className="text-xs text-graphite">{line.when}</span>
            </span>
          </li>
        ))}
      </ol>
      {cursor && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          loading={pending}
          onClick={more}
        >
          Show older
        </Button>
      )}
      <p className="text-xs leading-normal text-graphite">
        Something you didn&rsquo;t expect? Raju can explain or undo it; every
        change is also in the audit log.
      </p>
    </section>
  );
}
