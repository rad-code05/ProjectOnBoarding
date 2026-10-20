import Link from "next/link";
import { ChevronRightIcon } from "@/components/ui";
import type { OpenGroup } from "@/lib/reports/open";

/** Requests per status: name, who it waits for, a black bar, the number written. */
export function OpenStatusBars({ groups }: { groups: OpenGroup[] }) {
  const max = Math.max(1, ...groups.map((g) => g.rows.length));
  return (
    <ul className="flex flex-col gap-2.5">
      {groups.map((g) => (
        <li
          key={g.state}
          className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-2.5 md:grid-cols-[12rem_minmax(0,1fr)]"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px]">{g.title}</span>
            <span className="truncate text-[11px] text-graphite">
              with {g.with}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-3.5 shrink-0 rounded-r-[4px] bg-ink"
              style={{
                width: `${Math.round((g.rows.length / max) * 800) / 10}%`,
              }}
            />
            <span className="text-xs font-semibold tabular-nums">
              {g.rows.length}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One section per status that has requests (board order), longest waiting
 * first: name, ticket · type, "Waiting 6d 2h · opened 9 Oct 2026", the
 * offboarding SLA in words when there is one.
 */
export function OpenRequestGroups({ groups }: { groups: OpenGroup[] }) {
  return (
    <>
      {groups
        .filter((g) => g.rows.length > 0)
        .map((g) => (
          <section
            key={g.state}
            aria-label={g.title}
            className="flex flex-col gap-2"
          >
            <h2 className="mt-1 text-sm font-bold">
              {g.title}{" "}
              <span className="font-medium text-graphite">
                · {g.rows.length}
              </span>
            </h2>
            <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">
              {g.rows.map((row) => {
                const body = (
                  <>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-bold">
                        {row.name}
                      </span>
                      <span className="truncate text-xs text-graphite">
                        {row.subtitle}
                      </span>
                      <span className="text-xs">
                        Waiting {row.waiting}{" "}
                        <span className="text-graphite">
                          · opened {row.opened}
                        </span>
                      </span>
                    </span>
                    {row.sla && (
                      <span className="inline-flex shrink-0 items-center rounded-pill border border-signal px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-signal">
                        {row.sla}
                      </span>
                    )}
                  </>
                );
                const box =
                  "flex items-center gap-2.5 rounded-card border border-line bg-paper px-3.5 py-3";
                return (
                  <li key={row.id}>
                    {row.href ? (
                      <Link href={row.href} className={box}>
                        {body}
                        <ChevronRightIcon
                          size={16}
                          className="shrink-0 text-graphite"
                        />
                      </Link>
                    ) : (
                      <div className={box}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </>
  );
}
