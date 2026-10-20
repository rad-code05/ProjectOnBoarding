import type { GroupRow } from "@/lib/reports/groups";

/**
 * Horizontal bars, biggest first (board: Phone · Onboarded by country): the
 * name, a black bar scaled to the biggest group, the number at the end. The
 * number is always written, so the bar is never the only way to read it.
 */
export function HBarChart({ rows }: { rows: GroupRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.onboarded));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li
          key={row.key ?? "none"}
          className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2.5 md:grid-cols-[12rem_minmax(0,1fr)]"
        >
          <span className="truncate text-[13px]" title={row.label}>
            {row.label}
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-3.5 shrink-0 rounded-r-[4px] bg-ink"
              style={{
                width: `${Math.round((row.onboarded / max) * 800) / 10}%`,
              }}
            />
            <span className="text-xs font-semibold tabular-nums">
              {row.onboarded}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
