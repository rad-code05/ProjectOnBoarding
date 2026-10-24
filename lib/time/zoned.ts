/**
 * Wall-clock date + time in a timezone ↔ an instant (F09c-2: the access
 * cut-off is typed in the company timezone). Pure — works in the browser and
 * on the server, daylight saving included.
 */

/** Minutes the zone is ahead of UTC at that instant. */
function offsetMinutes(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - Math.floor(at / 1000) * 1000) / 60000);
}

/** "2026-09-30" + "18:00" in Asia/Dubai → "2026-09-30T14:00:00.000Z". */
export function zonedToIso(
  date: string,
  time: string,
  timeZone: string,
): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  // Guess with the offset at the wall time, then correct once (DST edges).
  let at = wall - offsetMinutes(wall, timeZone) * 60000;
  at = wall - offsetMinutes(at, timeZone) * 60000;
  return new Date(at).toISOString();
}

/** An instant → its date ("2026-09-30") and time ("18:00") in the zone. */
export function zonedParts(
  iso: string,
  timeZone: string,
): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/**
 * The instant this month began in the zone: "1 Oct 00:00 in Dubai" →
 * "2026-09-30T20:00:00.000Z". For "this month" counts (Requests tile,
 * Approvals), the same rule as the reports (company timezone).
 */
export function monthStart(timeZone: string, now = new Date()): string {
  const { date } = zonedParts(now.toISOString(), timeZone);
  return zonedToIso(`${date.slice(0, 7)}-01`, "00:00", timeZone);
}

/** The instant today began in the zone (midnight there). */
export function dayStart(timeZone: string, now = new Date()): string {
  const { date } = zonedParts(now.toISOString(), timeZone);
  return zonedToIso(date, "00:00", timeZone);
}

/** The instant this week began in the zone (Monday, midnight there). */
export function weekStart(timeZone: string, now = new Date()): string {
  const { date } = zonedParts(now.toISOString(), timeZone);
  const day = new Date(`${date}T00:00:00Z`);
  // getUTCDay: Sunday = 0 → 6 days back to Monday; Monday = 1 → 0.
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return zonedToIso(day.toISOString().slice(0, 10), "00:00", timeZone);
}
