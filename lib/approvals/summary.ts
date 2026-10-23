/** Small pure helpers for the Approvals page (testable without a server). */

/** "Figma, Slack, Google Workspace +2" — at most three names. */
export function accessSummary(apps: string[]): string {
  if (apps.length === 0) return "—";
  const shown = apps.slice(0, 3).join(", ");
  return apps.length > 3 ? `${shown} +${apps.length - 3}` : shown;
}
