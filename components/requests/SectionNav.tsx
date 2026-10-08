import { CheckIcon, LockIcon } from "@/components/ui";
import { cn } from "@/lib/cn";

export type SectionNavItem = {
  number: number;
  short: string;
  title: string;
  state: "complete" | "todo" | "locked" | "empty";
  note?: string;
};

function Mark({ state }: { state: SectionNavItem["state"] }) {
  if (state === "complete") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-pill bg-ink text-paper">
        <CheckIcon size={9} strokeWidth={3.5} />
      </span>
    );
  }
  if (state === "locked") return <LockIcon size={15} className="shrink-0" />;
  return (
    <span
      className={cn(
        "size-4 shrink-0 rounded-pill",
        state === "todo"
          ? "border-2 border-ink"
          : "border-[1.5px] border-step-border",
      )}
    />
  );
}

/**
 * Jump to a section. Phone: one row of chips that scrolls sideways;
 * desktop: the left rail with the full titles and a note under each.
 */
export function SectionNav({
  items,
  onSelect,
}: {
  items: SectionNavItem[];
  onSelect: (number: number) => void;
}) {
  return (
    <nav aria-label="Form sections" className="-mx-4 overflow-x-auto md:mx-0">
      <span className="hidden px-2 pb-1.5 text-[10px] font-semibold tracking-[0.12em] text-graphite uppercase md:block">
        Sections
      </span>
      <ol className="inline-flex gap-1.5 px-4 pb-2.5 whitespace-nowrap md:flex md:flex-col md:gap-px md:p-0 md:whitespace-normal">
        {items.map((item) => (
          <li key={item.number}>
            <a
              href={`#s${item.number}`}
              onClick={() => onSelect(item.number)}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-pill border pr-3 pl-2 text-[13px] md:h-auto md:items-start md:gap-2.5 md:rounded-[8px] md:border-0 md:px-2 md:py-1.5 md:text-xs",
                item.state === "locked"
                  ? "border-line text-graphite"
                  : "border-line bg-paper md:bg-transparent",
                item.state === "todo" && "border-ink font-bold md:font-normal",
              )}
            >
              <Mark state={item.state} />
              <span className="md:hidden">
                {item.number} {item.short}
              </span>
              <span className="hidden flex-col gap-0.5 md:flex">
                <span>
                  {item.number} · {item.title}
                </span>
                {item.note && (
                  <span className="text-[10px] text-graphite">{item.note}</span>
                )}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
