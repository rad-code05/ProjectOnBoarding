const dayMonthYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Company timezone — D3 is still open; the database assumes the same. */
const COMPANY_TIMEZONE = "Europe/Zurich";
const companyDay = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: COMPANY_TIMEZONE,
});
const companyTime = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: COMPANY_TIMEZONE,
});

/** A server timestamp → "7 Oct 2026" in the company timezone. */
export function formatDay(iso: string | null): string {
  return iso ? companyDay.format(new Date(iso)) : "—";
}

/** A server timestamp → "14:12" in the company timezone. */
export function formatTime(iso: string): string {
  return companyTime.format(new Date(iso));
}

/** "2026-10-14" (a date without time) → "14 Oct 2026". */
export function formatDate(date: string | null): string {
  if (!date) return "—";
  return dayMonthYear.format(new Date(`${date}T00:00:00Z`));
}

/** How long ago something changed: "Just now", "5 minutes ago", "yesterday"… */
export function formatUpdated(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "Just now";
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86400)
    return relative.format(Math.round(seconds / 86400), "day");
  return formatDate(iso.slice(0, 10));
}
