import Link from "next/link";
import { ChevronRightIcon } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  ACCESS_KINDS,
  ACCESS_KIND_INFO,
  type AccessHolder,
  type AccessItem,
  type AccessKind,
} from "@/lib/reports/access";

/** Applications / Devices / Access — links, so each tab has its own URL. */
export function AccessKindTabs({
  kind,
  hrefFor,
}: {
  kind: AccessKind;
  hrefFor: (kind: AccessKind) => string;
}) {
  return (
    <nav
      aria-label="What to show"
      className="grid h-11 grid-cols-3 gap-0 rounded-pill border border-field-border bg-paper p-[3px] md:max-w-md"
    >
      {ACCESS_KINDS.map((k) => (
        <Link
          key={k}
          href={hrefFor(k)}
          aria-current={k === kind ? "page" : undefined}
          scroll={false}
          className={cn(
            "flex items-center justify-center rounded-pill text-[13px] font-semibold",
            k === kind ? "bg-ink text-paper" : "text-ink",
          )}
        >
          {ACCESS_KIND_INFO[k].tab}
        </Link>
      ))}
    </nav>
  );
}

/**
 * People per item, most first: name (+ category), a black bar scaled to the
 * biggest, the number written, a chevron — the whole row opens who holds it.
 */
export function AccessItemBars({
  items,
  hrefFor,
}: {
  items: AccessItem[];
  hrefFor: (key: string) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.holders));
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={hrefFor(item.key)}
            className="grid min-h-11 grid-cols-[7rem_minmax(0,1fr)_1rem] items-center gap-2.5 border-b border-line-subtle py-1 md:grid-cols-[14rem_minmax(0,1fr)_1rem]"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-semibold">
                {item.name}
              </span>
              {item.category && (
                <span className="truncate text-[11px] text-graphite">
                  {item.category}
                </span>
              )}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-3 shrink-0 rounded-r-[4px] bg-ink"
                style={{
                  width: `${Math.round((item.holders / max) * 800) / 10}%`,
                }}
              />
              <span className="text-xs font-semibold tabular-nums">
                {item.holders}
              </span>
            </span>
            <ChevronRightIcon size={16} className="text-graphite" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** One card per person holding the item (board: … · one app (who holds it)). */
export function AccessHolderList({ rows }: { rows: AccessHolder[] }) {
  return (
    <ul className="flex flex-col gap-2.5 md:grid md:grid-cols-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-col gap-2 rounded-card border border-line bg-paper px-3.5 py-3"
        >
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[15px] font-bold">{row.name}</span>
              <span className="truncate text-xs text-graphite">
                {row.subtitle}
              </span>
            </div>
            <span className="inline-flex shrink-0 items-center rounded-pill bg-line-subtle px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap">
              {row.detail}
            </span>
          </div>
          <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2.5 gap-y-1 text-xs leading-snug">
            <dt className="text-graphite">Since</dt>
            <dd>{row.since}</dd>
            <dt className="text-graphite">Granted by</dt>
            <dd>
              {row.grantedHref ? (
                <Link href={row.grantedHref} className="underline">
                  {row.grantedBy}
                </Link>
              ) : (
                row.grantedBy
              )}
            </dd>
          </dl>
          {row.leaving && (
            <span className="text-xs font-semibold text-signal">
              Leaving — offboarding{" "}
              {row.leaving.href ? (
                <Link href={row.leaving.href} className="underline">
                  {row.leaving.ticketId}
                </Link>
              ) : (
                row.leaving.ticketId
              )}{" "}
              is open
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
