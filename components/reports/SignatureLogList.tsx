import Link from "next/link";
import { StatusPill } from "@/components/ui";
import type { SignatureRow } from "@/lib/reports/signatures";
import { TYPE_LABELS } from "@/lib/requests/labels";

/**
 * The Signature log (board: Phone · Signature log): one card per request —
 * name, ticket · type, status, then IT signed / Approved / Time to approve /
 * PDF record. Cards on phones, two columns on desktop.
 */
export function SignatureLogList({ rows }: { rows: SignatureRow[] }) {
  return (
    <ul className="flex flex-col gap-2.5 md:grid md:grid-cols-2">
      {rows.map((row) => {
        const who = (
          <>
            <span className="truncate text-[15px] font-bold">{row.name}</span>
            <span className="truncate text-xs text-graphite">
              {row.ticketId} · {TYPE_LABELS[row.type]}
            </span>
          </>
        );
        return (
          <li
            key={row.id}
            className="flex flex-col gap-2 rounded-card border border-line bg-paper px-3.5 py-3"
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
            <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2.5 gap-y-1 text-xs leading-snug">
              <dt className="text-graphite">IT signed</dt>
              <dd>{row.itSigned}</dd>
              <dt className="text-graphite">Approved</dt>
              <dd>{row.approved}</dd>
              <dt className="text-graphite">Time to approve</dt>
              <dd className="font-semibold">{row.timeToApprove}</dd>
              <dt className="text-graphite">PDF record</dt>
              <dd>{row.pdf}</dd>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
