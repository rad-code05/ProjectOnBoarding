"use client";

import Link from "next/link";
import { Sheet } from "@/components/ui";
import type { AuditEntry } from "@/lib/audit/log";
import { formatDay } from "@/lib/requests/format";
import { zoneCity } from "./time";

/** "10:48:12" — seconds matter in an audit trail. */
function timeWithSeconds(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/**
 * One audit event in full (board: Audit event details): when (server time,
 * to the second), who and their roles, the record it belongs to, what
 * changed — before and after — and the other stored values.
 */
export function AuditEventSheet({
  entry,
  timeZone,
  onClose,
}: {
  entry: AuditEntry;
  timeZone: string;
  onClose: () => void;
}) {
  const rows: [string, React.ReactNode][] = [
    [
      "When",
      `${formatDay(entry.at, timeZone)}, ${timeWithSeconds(entry.at, timeZone)} (${zoneCity(timeZone)}, server time)`,
    ],
    ["Who", entry.roles ? `${entry.who} · ${entry.roles}` : entry.who],
  ];
  if (entry.record) {
    rows.push([
      "Record",
      entry.recordHref ? (
        <Link href={entry.recordHref} className="font-semibold underline">
          {entry.record} →
        </Link>
      ) : (
        entry.record
      ),
    ]);
  }
  rows.push([
    "Type",
    [entry.kind, entry.context].filter(Boolean).join(" · ") || "—",
  ]);

  return (
    <Sheet
      eyebrow={`Audit event · ${entry.chip}`}
      title={`${entry.who} ${entry.what}`}
      onClose={onClose}
    >
      <dl className="flex flex-col gap-2.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3">
            <dt className="w-16 shrink-0 text-xs font-semibold text-graphite">
              {label}
            </dt>
            <dd className="min-w-0 flex-1 break-words">{value}</dd>
          </div>
        ))}
      </dl>

      {entry.changes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
            What changed
          </h3>
          <table className="w-full table-fixed border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-xs text-graphite">
                <th scope="col" className="py-1.5 pr-2 font-semibold">
                  Field
                </th>
                <th scope="col" className="py-1.5 pr-2 font-semibold">
                  Before
                </th>
                <th scope="col" className="py-1.5 font-semibold">
                  After
                </th>
              </tr>
            </thead>
            <tbody>
              {entry.changes.map((change, i) => (
                <tr key={i} className="border-b border-line-subtle align-top">
                  <th scope="row" className="py-1.5 pr-2 font-semibold">
                    {change.field}
                  </th>
                  <td className="py-1.5 pr-2 break-words text-graphite">
                    {change.before}
                  </td>
                  <td className="py-1.5 break-words">{change.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {entry.facts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
            Details
          </h3>
          <dl className="flex flex-col gap-1.5 text-[13px]">
            {entry.facts.map((fact) => (
              <div key={fact.label} className="flex gap-3">
                <dt className="w-32 shrink-0 text-graphite">{fact.label}</dt>
                <dd className="min-w-0 flex-1 break-all">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <p className="text-xs leading-normal text-graphite">
        Event #{entry.id} · append-only. Times and names were set by the system;
        nobody can change or delete this entry.
      </p>
    </Sheet>
  );
}
