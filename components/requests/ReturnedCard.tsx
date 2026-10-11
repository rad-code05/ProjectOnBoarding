import { Button } from "@/components/ui";
import { firstFlagged, type ReturnInfo } from "@/lib/requests/returned";

/** Frame of a section the approver flagged (signal border instead of the line). */
export function sectionFrame(flag: string | null | undefined) {
  return flag ? "border-2 border-signal" : "border border-line";
}

/** "Flagged by Moises" next to a section title. */
export function SectionFlag({ label }: { label: string | null | undefined }) {
  if (!label) return null;
  return (
    <span className="self-center rounded-pill bg-signal px-2 py-0.75 text-[11px] font-bold whitespace-nowrap text-paper">
      {label}
    </span>
  );
}

/**
 * Raju's Returned view (board Phone · Returned request): who returned it and
 * when, the comment, Go to the first flagged section, and what happens next.
 */
export function ReturnedCard({
  info,
  onGoTo,
}: {
  info: ReturnInfo;
  /** Open and scroll to a section. */
  onGoTo: (section: number) => void;
}) {
  const first = firstFlagged(info);
  return (
    <section
      aria-label="Returned"
      className="flex flex-col gap-2.5 rounded-card border-2 border-signal bg-paper p-3.5 md:col-span-2 md:px-5"
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-bold text-signal">
          Returned by {info.byName}
        </h2>
        {info.atLabel && (
          <span className="text-xs text-graphite">{info.atLabel}</span>
        )}
      </div>
      <p className="text-sm leading-normal">“{info.comment}”</p>
      {first && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onGoTo(first.number)}
          >
            Go to {first.title}
          </Button>
        </div>
      )}
      <p className="text-xs leading-normal text-graphite">
        Sections 1–9 are open again. Your earlier signature was removed (it
        stays in the audit log). When you&apos;re done, use Review &amp; sign
        again — you can add a note for {info.byFirstName} there.
      </p>
    </section>
  );
}
