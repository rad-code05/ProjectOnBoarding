import { cn } from "@/lib/cn";
import { STATE_LABELS, type RequestState } from "@/lib/requests/labels";

const styles: Record<RequestState, string> = {
  draft: "border border-ink",
  in_execution: "bg-ink text-paper",
  pending_confirmation: "bg-suggest",
  returned: "border border-signal text-signal",
  closed: "bg-sand text-graphite",
  cancelled: "bg-sand text-graphite line-through",
};

/** Request status as a pill — the word always carries the meaning, colour only helps. */
export function StatusPill({
  state,
  className,
}: {
  state: RequestState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-pill px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        styles[state],
        className,
      )}
    >
      {STATE_LABELS[state]}
    </span>
  );
}
