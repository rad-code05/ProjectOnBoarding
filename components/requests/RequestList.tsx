import Link from "next/link";
import {
  Avatar,
  ChevronRightIcon,
  DownloadIcon,
  StatusPill,
} from "@/components/ui";
import { formatDate, formatUpdated } from "@/lib/requests/format";
import { TYPE_LABELS, countryName, personName } from "@/lib/requests/labels";
import type { RequestRow } from "@/lib/requests/list";
import { slaBadge } from "@/lib/requests/offboarding";

function SlaBadge({
  badge,
}: {
  badge: { text: string; late: boolean } | null;
}) {
  if (!badge) return null;
  return (
    <span
      className={
        badge.late
          ? "rounded-pill bg-signal px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-paper"
          : "rounded-pill border border-ink px-2 py-0.5 text-[11px] font-bold whitespace-nowrap"
      }
    >
      {badge.text}
    </span>
  );
}

function view(row: RequestRow, now: Date) {
  const name = personName(row.first_name, row.last_name);
  return {
    // A closed request opens its record (PDF, signatures) — F08d.
    href: row.state === "closed" ? `/records/${row.id}` : `/requests/${row.id}`,
    name: name || "New request",
    unnamed: !name,
    email: row.work_email ?? "No work email yet",
    country: row.country ? countryName(row.country) : "—",
    effective: formatDate(row.effective_date),
    updated: formatUpdated(row.updated_at, now),
    assignee:
      personName(row.assignee?.first_name, row.assignee?.last_name) || "—",
    hasPdf: row.state === "closed",
    sla: slaBadge(row, now.getTime()),
  };
}

/** Requests as a table on desktop and as cards on phones (same data, same links). */
export function RequestList({
  rows,
  now = new Date(),
}: {
  rows: RequestRow[];
  now?: Date;
}) {
  return (
    <>
      {/* Phone: cards */}
      <ul className="flex flex-col gap-2.5 md:hidden">
        {rows.map((row) => {
          const v = view(row, now);
          return (
            <li key={row.id}>
              <Link
                href={v.href}
                className="flex flex-col gap-2.5 rounded-card border border-line bg-paper px-4 py-3.5"
              >
                <span className="flex items-center gap-2.5">
                  <Avatar
                    name={v.unnamed ? "?" : v.name}
                    size="md"
                    decorative
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-bold">
                      {v.name}
                    </span>
                    <span className="truncate text-xs text-graphite">
                      {v.email}
                    </span>
                  </span>
                  <StatusPill state={row.state} />
                </span>
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-graphite">
                  <span className="font-semibold text-ink">
                    {TYPE_LABELS[row.type]}
                  </span>
                  <SlaBadge badge={v.sla} />
                  <span>{row.ticket_id}</span>
                  <span>{v.country}</span>
                </span>
                <span className="flex items-center justify-between gap-3 border-t border-line-subtle pt-2.5 text-xs">
                  <span>Effective {v.effective}</span>
                  <span className="flex shrink-0 items-center gap-2 text-graphite">
                    {v.updated}
                    {v.hasPdf && (
                      <span className="flex items-center gap-0.5 font-bold text-ink">
                        <DownloadIcon size={14} strokeWidth={2} />
                        PDF
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Desktop: table */}
      <div className="hidden overflow-hidden rounded-card border border-line bg-paper md:block">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className="border-b border-line text-left text-[10px] font-bold tracking-[0.1em] text-graphite uppercase">
              <th scope="col" className="w-[22%] px-5 py-3">
                Employee
              </th>
              <th scope="col" className="w-[13%] px-3 py-3">
                Ticket
              </th>
              <th scope="col" className="w-[12%] px-3 py-3">
                Type
              </th>
              <th scope="col" className="w-[15%] px-3 py-3">
                Status
              </th>
              <th scope="col" className="w-[10%] px-3 py-3">
                Country
              </th>
              <th scope="col" className="w-[10%] px-3 py-3">
                Effective
              </th>
              <th scope="col" className="w-[10%] px-3 py-3">
                Assignee
              </th>
              <th scope="col" className="w-[8%] px-3 py-3">
                Updated
              </th>
              <th scope="col" className="w-10 py-3">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const v = view(row, now);
              return (
                <tr
                  key={row.id}
                  className="relative border-b border-line-subtle last:border-b-0 hover:bg-sand/60"
                >
                  <td className="px-5 py-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Avatar
                        name={v.unnamed ? "?" : v.name}
                        tone="sand"
                        decorative
                        className="size-7 text-[10px]"
                      />
                      <span className="flex min-w-0 flex-col">
                        {/* The link covers the whole row (after:inset-0). */}
                        <Link
                          href={v.href}
                          className="truncate font-bold after:absolute after:inset-0 after:content-['']"
                        >
                          {v.name}
                        </Link>
                        <span className="truncate text-[11px] text-graphite">
                          {v.email}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-graphite">{row.ticket_id}</td>
                  <td className="px-3 py-3">
                    <span className="flex flex-col items-start gap-1">
                      {TYPE_LABELS[row.type]}
                      <SlaBadge badge={v.sla} />
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill state={row.state} />
                  </td>
                  <td className="truncate px-3 py-3">{v.country}</td>
                  <td className="px-3 py-3">{v.effective}</td>
                  <td className="truncate px-3 py-3">{v.assignee}</td>
                  <td className="px-3 py-3 text-graphite">{v.updated}</td>
                  <td className="py-3 pr-4">
                    {v.hasPdf ? (
                      <span
                        className="flex items-center gap-0.5 text-[10px] font-bold"
                        title="PDF available"
                      >
                        <DownloadIcon size={14} strokeWidth={2} />
                        PDF
                      </span>
                    ) : (
                      <ChevronRightIcon className="text-graphite" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
