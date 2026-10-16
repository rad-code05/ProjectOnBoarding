/**
 * Months for "Onboarded by month" (D16: closed by the approver, company
 * timezone). Pure — used by the page, the CSV and the tests.
 */

export type MonthCount = { month: string; onboarded: number };

/** "2026-08-01" or "2026-08-17" → "2026-08-01". */
export const monthOf = (day: string) => `${day.slice(0, 7)}-01`;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-08-01" → "Aug 2026" (always three letters — en-GB would say "Sept"). */
export function monthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** "2026-08-01" → "A" (axis label when there is little room). */
export function monthLetter(month: string): string {
  return monthLabel(month).charAt(0);
}

/** "2026-10-01" + n months → "2027-01-01". */
function addMonths(month: string, n: number): string {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The first and last month a report covers, always whole calendar months:
 * Month = this month, 3 / 12 months = this month and the 2 / 11 before;
 * picked dates = the months they fall in; "All time" = from the earliest
 * closed onboarding (else this month) to now.
 */
export function monthSpan(
  filters: { period: string; from: string | null; to: string | null },
  today: string,
  earliest: string | null,
): { first: string; last: string } {
  const current = monthOf(today);
  if (!filters.from && !filters.to) {
    const back = { month: 0, "3m": 2, "12m": 11 }[filters.period];
    if (back !== undefined) {
      return { first: addMonths(current, -back), last: current };
    }
  }
  const last = monthOf(filters.to ?? today);
  let first = monthOf(filters.from ?? earliest ?? today);
  if (first > last) first = last;
  return { first, last };
}

export type MonthSummary = {
  total: number;
  /** The month with the most onboardings (the latest one on a tie), or null. */
  busiest: MonthCount | null;
};

export function summarise(months: MonthCount[]): MonthSummary {
  let busiest: MonthCount | null = null;
  let total = 0;
  for (const m of months) {
    total += m.onboarded;
    if (m.onboarded > 0 && (!busiest || m.onboarded >= busiest.onboarded)) {
      busiest = m;
    }
  }
  return { total, busiest };
}

/**
 * Round axis maximum and gridlines for the bar chart: 4 → [0, 2, 4],
 * 7 → [0, 4, 8], 23 → [0, 10, 20, 30]. Never below 4, so one onboarding
 * doesn't fill the chart.
 */
export function axisTicks(max: number): number[] {
  const top = Math.max(4, max);
  const step =
    top <= 4 ? 2 : top <= 8 ? 4 : top <= 20 ? 5 : top <= 40 ? 10 : 20;
  const end = Math.ceil(top / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= end; v += step) ticks.push(v);
  return ticks;
}
