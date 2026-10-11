import Link from "next/link";
import { DownloadIcon } from "@/components/ui";
import type { RecordRow } from "@/lib/records/list";
import { TYPE_LABELS } from "@/lib/requests/labels";

/**
 * Closed requests (board: Phone · Records): one card per record — name,
 * ticket · type, closed date · approved by — opening the record page, with
 * a download button for its PDF. Cards on phones, two columns on desktop.
 */
export function RecordList({ rows }: { rows: RecordRow[] }) {
  return (
    <ul className="flex flex-col gap-2.5 md:grid md:grid-cols-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex items-center gap-2 rounded-card border border-line bg-paper py-3 pr-2 pl-3.5"
        >
          <Link
            href={`/records/${row.id}`}
            className="flex min-w-0 flex-1 flex-col gap-0.5"
          >
            <span className="truncate text-[15px] font-bold">{row.name}</span>
            <span className="truncate text-xs text-graphite">
              {row.ticketId} · {TYPE_LABELS[row.type]}
            </span>
            <span className="truncate text-xs text-graphite">
              Closed {row.closed} · approved by {row.approvedBy}
            </span>
          </Link>
          <a
            href={`/records/${row.id}/pdf`}
            aria-label={`Download the PDF record of ${row.name}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-pill border border-ink hover:bg-sand"
          >
            <DownloadIcon size={18} />
          </a>
        </li>
      ))}
    </ul>
  );
}
