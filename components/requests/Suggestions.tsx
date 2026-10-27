"use client";

import { useId, useState } from "react";
import { RobotAvatar } from "@/components/assistant/RobotAvatar";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type {
  FieldSuggestion,
  ItemSuggestion,
} from "@/lib/requests/suggestions";

/**
 * The assistant's suggestions on the form (F16b, boards *Draft with the
 * assistant's suggestions* and *Suggested applications, equipment and
 * access*): a black banner with the count, dashed suggested values with
 * their own Accept / Reject. Nothing changes until the person accepts.
 */

/** Above this many, Accept all asks once more. */
export const ACCEPT_ALL_CONFIRM_OVER = 10;

const plural = (n: number) => `${n} suggestion${n === 1 ? "" : "s"}`;

export function SuggestionsBanner({
  total,
  busy,
  message,
  onAcceptAll,
  onRejectAll,
  onNext,
}: {
  total: number;
  busy: boolean;
  /** What the last action ended with ("Couldn't save …"). */
  message: string | null;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onNext: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const acceptAll = () => {
    if (total > ACCEPT_ALL_CONFIRM_OVER && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onAcceptAll();
  };
  return (
    <section
      aria-label="Suggestions from the assistant"
      className="flex flex-col gap-2.5 rounded-card bg-ink p-3.5 text-paper md:col-span-2"
    >
      <p className="flex items-center gap-2.5 text-sm leading-snug">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-sand">
          <RobotAvatar size={26} />
        </span>
        <span>
          <strong>{plural(total)}</strong> from the assistant. Nothing is saved
          until you accept.
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={acceptAll}
          className="h-10 rounded-pill bg-sand px-4 text-[13px] font-semibold text-ink disabled:opacity-60"
        >
          {confirming ? `Yes, accept all ${total}` : `Accept all ${total}`}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onNext}
          className="h-10 rounded-pill border border-stone px-3.5 text-[13px] font-semibold disabled:opacity-60"
        >
          Next suggestion
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setConfirming(false);
            onRejectAll();
          }}
          className="h-10 px-2 text-[13px] font-semibold underline underline-offset-2 disabled:opacity-60"
        >
          Reject all
        </button>
      </div>
      {(confirming || message) && (
        <p role="status" className="text-xs leading-snug text-sand">
          {message ??
            `That fills ${total} values. Check them after — every one is in the audit log.`}
        </p>
      )}
    </section>
  );
}

function Why({ reason }: { reason: string | null }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-graphite md:text-[11px]">
      <RobotAvatar size={16} />
      Suggested{reason ? ` · ${reason}` : ""}
    </span>
  );
}

/** Which of this suggestion's buttons is saving right now, if any. */
export type Working = "accept" | "reject" | null;

/**
 * Accept / Reject. Only the button pressed shows that it is saving; the
 * others keep their look (Raju, 2026-10-27) and simply wait — a click while
 * another suggestion saves does nothing.
 */
function Decide({
  what,
  busy,
  working,
  acceptLater = false,
  onAccept,
  onReject,
}: {
  what: string;
  busy: boolean;
  working: Working;
  /** Accept waits (e.g. until execution starts); Reject still works. */
  acceptLater?: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const guard = (fn: () => void) => () => {
    if (!busy) fn();
  };
  return (
    <span className="flex gap-1.5">
      {!acceptLater && (
        <Button
          size="sm"
          loading={working === "accept"}
          aria-disabled={busy || undefined}
          onClick={guard(onAccept)}
          aria-label={`Accept ${what}`}
        >
          Accept
        </Button>
      )}
      <Button
        size="sm"
        variant="secondary"
        loading={working === "reject"}
        aria-disabled={busy || undefined}
        onClick={guard(onReject)}
        aria-label={`Reject ${what}`}
      >
        Reject
      </Button>
    </span>
  );
}

/** A suggested value in place of the field's input, until it is decided. */
export function SuggestedField({
  label,
  suggestion,
  busy,
  working = null,
  onAccept,
  onReject,
  className,
}: {
  label: string;
  suggestion: FieldSuggestion;
  busy: boolean;
  working?: Working;
  onAccept: () => void;
  onReject: () => void;
  /** The field's grid cell (phone span). */
  className?: string;
}) {
  const id = useId();
  return (
    <div
      className={cn("flex min-w-0 flex-col gap-1.5", className)}
      data-suggestion={suggestion.id}
      data-field-label={label}
    >
      <span id={id} className="text-xs font-semibold md:text-[11px]">
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={id}
        className="flex flex-col gap-2 rounded-field border-[1.5px] border-dashed border-ink bg-paper px-3 py-2.5"
      >
        <span className="text-base break-words md:text-[13px]">
          {suggestion.shown}
        </span>
        <Why reason={suggestion.reason} />
        <Decide
          what={`${label}: ${suggestion.shown}`}
          busy={busy}
          working={working}
          onAccept={onAccept}
          onReject={onReject}
        />
      </div>
    </div>
  );
}

/** Suggested rows for sections 5–7, above the section's own list. */
export function SuggestedItems({
  items,
  busy,
  working,
  waitHint,
  onAccept,
  onReject,
}: {
  items: ItemSuggestion[];
  busy: boolean;
  /** Not yet: why these can't be accepted now (they keep Reject). */
  waitHint?: string;
  /** The suggestion being decided and how (only its button shows it). */
  working?: { id: string; accept: boolean } | null;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul
      aria-label="Suggested by the assistant"
      className="flex flex-col gap-2 md:col-span-2"
    >
      {waitHint && (
        <li className="text-[13px] leading-snug text-graphite md:text-xs">
          {waitHint}
        </li>
      )}
      {items.map((item) => (
        <li
          key={item.id}
          data-suggestion={item.id}
          className="flex flex-col gap-2 rounded-card border-[1.5px] border-dashed border-ink bg-paper p-3"
        >
          <span className="flex flex-wrap items-baseline gap-2">
            <strong className="text-[15px] md:text-sm">{item.name}</strong>
            {item.detail && (
              <span className="text-[13px] text-graphite md:text-xs">
                {item.detail}
              </span>
            )}
          </span>
          <Why reason={item.reason} />
          <Decide
            what={`${item.name}${item.detail ? ` (${item.detail})` : ""}`}
            busy={busy}
            acceptLater={Boolean(waitHint)}
            working={
              working?.id === item.id
                ? working.accept
                  ? "accept"
                  : "reject"
                : null
            }
            onAccept={() => onAccept(item.id)}
            onReject={() => onReject(item.id)}
          />
        </li>
      ))}
    </ul>
  );
}
