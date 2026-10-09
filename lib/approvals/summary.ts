/** Small pure helpers for the Approvals page (testable without a server). */

/** "Figma, Slack, Google Workspace +2" — at most three names. */
export function accessSummary(apps: string[]): string {
  if (apps.length === 0) return "—";
  const shown = apps.slice(0, 3).join(", ");
  return apps.length > 3 ? `${shown} +${apps.length - 3}` : shown;
}

/** First day of the current month in the company timezone, as an ISO date. */
export function monthStart(now = new Date()): string {
  const [year, month] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
  })
    .format(now)
    .split("-");
  return `${year}-${month}-01`;
}
