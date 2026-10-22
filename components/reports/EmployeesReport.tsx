import Link from "next/link";
import { ChevronRightIcon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type {
  EmployeeCard,
  OfficeLine,
  OfficeTotals,
} from "@/lib/reports/employees";

/**
 * People per office (board: Phone · Employees by office): a black bar per
 * office, its states · cities indented with a thinner grey bar; each row
 * opens the list of its people.
 */
export function OfficeBars({
  lines,
  hrefFor,
}: {
  lines: OfficeLine[];
  hrefFor: (line: OfficeLine) => string;
}) {
  const max = Math.max(1, ...lines.map((l) => l.employees));
  return (
    <ul className="flex flex-col">
      {lines.map((line) => (
        <li key={line.key}>
          <Link
            href={hrefFor(line)}
            className={cn(
              "grid min-h-11 grid-cols-[7.75rem_minmax(0,1fr)_1rem] items-center gap-2.5 border-b border-line-subtle py-1 md:grid-cols-[14rem_minmax(0,1fr)_1rem]",
              line.sub && "pl-3.5",
            )}
          >
            <span
              className={cn(
                "truncate text-[13px]",
                line.sub ? "text-graphite" : "font-semibold",
              )}
            >
              {line.label}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "shrink-0 rounded-r-[4px]",
                  line.sub ? "h-2 bg-graphite" : "h-3 bg-ink",
                )}
                style={{
                  width: `${Math.round((line.employees / max) * 800) / 10}%`,
                }}
              />
              <span className="text-xs font-semibold tabular-nums">
                {line.employees}
              </span>
            </span>
            <ChevronRightIcon size={16} className="text-graphite" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Every office: employees, leaving, share — with the total. */
export function OfficeTable({
  lines,
  totals,
}: {
  lines: OfficeLine[];
  totals: OfficeTotals;
}) {
  const cell = "px-3.5 py-2 text-right";
  return (
    <section className="overflow-hidden rounded-card border border-line bg-paper md:max-w-xl">
      <table className="w-full border-collapse text-sm tabular-nums">
        <caption className="px-3.5 pt-3 pb-1.5 text-left text-sm font-bold">
          Every office
        </caption>
        <thead>
          <tr className="border-b border-line text-xs text-graphite">
            <th scope="col" className="px-3.5 py-2 text-left font-semibold">
              Office
            </th>
            <th scope="col" className={cn(cell, "font-semibold")}>
              Employees
            </th>
            <th scope="col" className={cn(cell, "font-semibold")}>
              Leaving
            </th>
            <th scope="col" className={cn(cell, "font-semibold")}>
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.key} className="border-b border-line-subtle">
              <th
                scope="row"
                className={cn(
                  "py-2 pr-3.5 text-left",
                  line.sub
                    ? "pl-7 font-normal text-graphite"
                    : "pl-3.5 font-medium",
                )}
              >
                {line.label}
              </th>
              <td className={cell}>{line.employees}</td>
              <td className={cell}>{line.leaving}</td>
              <td className={cn(cell, "text-graphite")}>{line.share}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="px-3.5 py-2.5 text-left">
              Total
            </th>
            <td className={cn(cell, "py-2.5 font-bold")}>{totals.employees}</td>
            <td className={cn(cell, "py-2.5 font-bold")}>{totals.leaving}</td>
            <td className={cn(cell, "py-2.5 text-graphite")}>100%</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

/** One card per person: name, email · department, where, since, Leaving. */
export function EmployeeList({ rows }: { rows: EmployeeCard[] }) {
  return (
    <ul className="flex flex-col gap-2.5 md:grid md:grid-cols-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-col gap-2 rounded-card border border-line bg-paper px-3.5 py-3"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[15px] font-bold">{row.name}</span>
            <span className="truncate text-xs text-graphite">
              {row.subtitle}
            </span>
          </div>
          <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2.5 gap-y-1 text-xs leading-snug">
            <dt className="text-graphite">Office</dt>
            <dd>{row.place}</dd>
            {row.country && (
              <>
                <dt className="text-graphite">Works in</dt>
                <dd>{row.country}</dd>
              </>
            )}
            {row.nationality && (
              <>
                <dt className="text-graphite">Nationality</dt>
                <dd>{row.nationality}</dd>
              </>
            )}
            {row.since && (
              <>
                <dt className="text-graphite">Onboarded</dt>
                <dd>{row.since}</dd>
              </>
            )}
            {row.record && (
              <>
                <dt className="text-graphite">Latest record</dt>
                <dd>
                  <Link href={row.record.href} className="underline">
                    {row.record.ticketId}
                  </Link>
                </dd>
              </>
            )}
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
