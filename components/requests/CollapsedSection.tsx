import { ChevronRightIcon, LockIcon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { SectionInfo } from "@/lib/requests/sections";

/**
 * A section shown as one row until it is relevant. Locked rows say who or
 * when; open rows say which step builds their content (until it exists).
 */
export function CollapsedSection({
  section,
  locked,
  note,
  open,
  onToggle,
}: {
  section: SectionInfo;
  /** Why it can't be opened ("Moises signs at the end"), or null. */
  locked: string | null;
  note: string;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = `s${section.number}-panel`;
  return (
    <section
      id={`s${section.number}`}
      className="rounded-card border border-line bg-paper md:col-span-2"
    >
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-disabled={locked ? true : undefined}
          onClick={locked ? undefined : onToggle}
          className={cn(
            "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left md:min-h-[50px] md:px-5",
            locked ? "cursor-default" : "cursor-pointer",
          )}
        >
          <span className="w-[18px] shrink-0 text-xs font-semibold text-graphite md:text-[11px]">
            {String(section.number).padStart(2, "0")}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-baseline md:gap-3">
            <span
              className={cn(
                "font-serif text-[17px] font-normal",
                locked && "text-graphite",
              )}
            >
              {section.title}
            </span>
            <span className="font-sans text-xs font-normal text-graphite">
              {locked ?? note}
            </span>
          </span>
          {locked ? (
            <LockIcon size={18} className="shrink-0 text-graphite" />
          ) : (
            <ChevronRightIcon
              size={18}
              className={cn(
                "shrink-0 transition-transform",
                open ? "-rotate-90" : "rotate-90",
              )}
            />
          )}
        </button>
      </h2>
      {open && !locked && (
        <div id={panelId} className="px-4 pb-4 text-sm text-graphite md:px-5">
          Coming with {section.builtIn} — this part of the form isn&apos;t built
          yet.
        </div>
      )}
    </section>
  );
}
