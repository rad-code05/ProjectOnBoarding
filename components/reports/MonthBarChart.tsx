"use client";

import { useState } from "react";
import {
  axisTicks,
  monthLabel,
  monthLetter,
  type MonthCount,
} from "@/lib/reports/months";

const W = 340;
const H = 200;
const LEFT = 24;
const BASE = 172;
const TOP = 12;

/** Bar with 4 px rounded top corners, anchored to the baseline. */
function barPath(x: number, y: number, w: number) {
  const r = Math.min(4, w / 2, BASE - y);
  if (BASE - y <= 0) return "";
  return `M${x},${BASE} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${BASE} Z`;
}

/**
 * Onboardings per month as vertical bars (board: Phone · Onboarded by
 * month). One series, so one ink colour and no legend; touch, hover or focus
 * a bar for its exact number — the others fade. The table under the chart
 * has every value too.
 */
export function MonthBarChart({ months }: { months: MonthCount[] }) {
  const [active, setActive] = useState<number | null>(null);
  const ticks = axisTicks(Math.max(0, ...months.map((m) => m.onboarded)));
  const top = ticks.at(-1)!;
  const yOf = (v: number) => BASE - (v / top) * (BASE - TOP);
  const slot = (W - LEFT) / Math.max(months.length, 1);
  const barW = Math.max(2, Math.min(18, slot * 0.6));
  const shown =
    active !== null
      ? months[active]
      : months.reduce<MonthCount | null>(
          (best, m) =>
            m.onboarded > 0 && (!best || m.onboarded >= best.onboarded)
              ? m
              : best,
          null,
        );
  const label = (m: MonthCount, i: number) => {
    if (months.length <= 12) return monthLetter(m.month);
    // Longer periods: only January and the first month get a label.
    return i === 0 || m.month.slice(5, 7) === "01"
      ? `${monthLabel(m.month).slice(0, 3)} ${m.month.slice(2, 4)}`
      : "";
  };

  return (
    <div className="flex flex-col gap-2">
      <span
        role="status"
        className="self-start rounded-pill bg-ink px-2.5 py-1 text-xs font-semibold text-paper tabular-nums"
      >
        {shown
          ? `${monthLabel(shown.month)} · ${shown.onboarded} onboarded`
          : "No onboardings in this period"}
      </span>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full max-w-[720px]"
        role="group"
        aria-label="Onboardings closed per month. The table below lists every month."
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={LEFT}
              x2={W}
              y1={yOf(t)}
              y2={yOf(t)}
              stroke={
                t === 0 ? "var(--color-line)" : "var(--color-line-subtle)"
              }
              strokeWidth="1"
            />
            <text
              x={LEFT - 6}
              y={yOf(t) + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--color-graphite)"
            >
              {t}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const x = LEFT + i * slot + (slot - barW) / 2;
          const faded = active !== null && active !== i;
          return (
            <g key={m.month}>
              <path
                d={barPath(x, yOf(m.onboarded), barW)}
                fill={faded ? "var(--color-stone)" : "var(--color-ink)"}
              />
              <text
                x={x + barW / 2}
                y={H - 10}
                textAnchor="middle"
                fontSize="10"
                fill="var(--color-graphite)"
              >
                {label(m, i)}
              </text>
              {/* Hit area bigger than the bar: the whole column. */}
              <rect
                x={LEFT + i * slot}
                y={TOP}
                width={slot}
                height={BASE - TOP}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`${monthLabel(m.month)}: ${m.onboarded} onboarded`}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="cursor-pointer outline-none focus-visible:stroke-ink focus-visible:stroke-2"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
