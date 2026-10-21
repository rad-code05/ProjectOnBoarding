import Link from "next/link";
import { StatusPill } from "@/components/ui";
import type { AllUsersRow } from "@/lib/reports/all-users";
import { TYPE_LABELS } from "@/lib/requests/labels";

/**
 * The All users list (board: Phone · All users list): one card per request —
 * name, email, status, ticket · type · department · country, office and
 * nationality (F27), dates. Cards on phones, two columns on desktop.
 */
export function AllUsersList({ rows }: { rows: AllUsersRow[] }) {
  return (
    <ul className="flex flex-col gap-2.5 md:grid md:grid-cols-2">
      {rows.map((row) => {
        const who = (
          <>
            <span className="truncate text-[15px] font-bold">{row.name}</span>
            <span className="truncate text-xs text-graphite">{row.email}</span>
          </>
        );
        return (
          <li
            key={row.id}
            className="flex flex-col gap-1.5 rounded-card border border-line bg-paper px-3.5 py-3"
          >
            <div className="flex items-start gap-2">
              {row.href ? (
                <Link
                  href={row.href}
                  className="flex min-w-0 flex-1 flex-col gap-0.5"
                >
                  {who}
                </Link>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {who}
                </div>
              )}
              <StatusPill state={row.state} />
            </div>
            <span className="text-xs text-graphite">
              {[
                row.ticketId,
                TYPE_LABELS[row.type],
                row.department,
                row.country,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {(row.office || row.nationality) && (
              <span className="text-xs text-graphite">
                {[
                  row.office && `Office: ${row.office}`,
                  row.nationality && `Nationality: ${row.nationality}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
            <span className="text-xs">{row.dates}</span>
          </li>
        );
      })}
    </ul>
  );
}
