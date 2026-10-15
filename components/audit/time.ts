import { formatDay } from "@/lib/requests/format";
import { zonedParts } from "@/lib/time/zoned";

/** "Asia/Dubai" → "Dubai", "America/New_York" → "New York". */
export function zoneCity(timeZone: string): string {
  return (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
}

/**
 * The day heading of a group of events: "Today · 15 Oct 2026",
 * "Yesterday · 14 Oct 2026", else the date — days in the viewer's timezone.
 */
export function dayHeading(
  iso: string,
  timeZone: string,
  now: Date = new Date(),
): string {
  const day = zonedParts(iso, timeZone).date;
  const today = zonedParts(now.toISOString(), timeZone).date;
  const yesterday = zonedParts(
    new Date(now.getTime() - 86_400_000).toISOString(),
    timeZone,
  ).date;
  const date = formatDay(iso, timeZone);
  if (day === today) return `Today · ${date}`;
  if (day === yesterday) return `Yesterday · ${date}`;
  return date;
}
