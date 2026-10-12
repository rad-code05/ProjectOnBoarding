const dayMonthYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * Company timezone (D3): Asia/Dubai, the default of
 * `app_settings.company_timezone`. The PDF record, ticket years, reports and
 * SLAs use the company setting; screens use each person's own timezone
 * (`my_timezone()`, F05e) and fall back to this one.
 */
export const COMPANY_TIMEZONE = "Asia/Dubai";

const formatters = new Map<string, Intl.DateTimeFormat>();

/** One formatter per timezone and kind, made once. */
function formatter(kind: "day" | "time", timeZone: string) {
  const key = `${kind}|${timeZone}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(
      "en-GB",
      kind === "day"
        ? { day: "numeric", month: "short", year: "numeric", timeZone }
        : { hour: "2-digit", minute: "2-digit", timeZone },
    );
    formatters.set(key, f);
  }
  return f;
}

/** A server timestamp → "7 Oct 2026" in the given timezone. */
export function formatDay(
  iso: string | null,
  timeZone: string = COMPANY_TIMEZONE,
): string {
  return iso ? formatter("day", timeZone).format(new Date(iso)) : "—";
}

/** A server timestamp → "14:12" in the given timezone. */
export function formatTime(
  iso: string,
  timeZone: string = COMPANY_TIMEZONE,
): string {
  return formatter("time", timeZone).format(new Date(iso));
}

/** A server timestamp → "7 Oct 2026, 14:12" in the given timezone. */
export function formatDayTime(
  iso: string,
  timeZone: string = COMPANY_TIMEZONE,
): string {
  return `${formatDay(iso, timeZone)}, ${formatTime(iso, timeZone)}`;
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
