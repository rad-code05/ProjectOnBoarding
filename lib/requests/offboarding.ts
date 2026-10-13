import { zonedToIso } from "@/lib/time/zoned";

/**
 * Offboarding (F09) pieces shared by the server and the screens: section 8
 * timelines, the deadline rule (the database has the last word — this is the
 * preview), and what an offboarding draft lists to remove.
 */
export type SlaTimeline = "same_day" | "within_24h" | "within_48h";

export const TIMELINE_LABELS: Record<SlaTimeline, string> = {
  same_day: "Same day",
  within_24h: "Within 24h",
  within_48h: "Within 48h",
};

export const TIMELINE_RULES: Record<SlaTimeline, string> = {
  same_day: "End of the cut-off day (23:59)",
  within_24h: "Cut-off + 24 hours",
  within_48h: "Cut-off + 48 hours",
};

/**
 * The deadline, as private.sla_deadline() works it out: Same day = 23:59:59
 * of the cut-off day in the company timezone; 24h / 48h after the cut-off.
 * null until timeline, date and time are all set.
 */
export function slaDeadline(
  timeline: string,
  cutoffDate: string,
  cutoffTime: string,
  timeZone: string,
): string | null {
  if (!timeline || !cutoffDate || !/^\d{2}:\d{2}$/.test(cutoffTime))
    return null;
  if (timeline === "same_day") {
    const end = new Date(zonedToIso(cutoffDate, "23:59", timeZone));
    return new Date(end.getTime() + 59_000).toISOString();
  }
  const hours =
    timeline === "within_24h" ? 24 : timeline === "within_48h" ? 48 : null;
  if (hours === null) return null;
  const cutoff = new Date(zonedToIso(cutoffDate, cutoffTime, timeZone));
  return new Date(cutoff.getTime() + hours * 3_600_000).toISOString();
}

/** What an offboarding lists in sections 5–7 (pre-filled from the inventory). */
export type Removals = {
  apps: { id: string; name: string; category: string; had: string | null }[];
  equipment: {
    id: string;
    name: string;
    assetTag: string | null;
    description: string | null;
  }[];
  access: { id: string; name: string; action: string; scope: string | null }[];
};

/** "7 applications, 1 device and 3 access types" */
export function removalsSummary(removals: Removals): string {
  const n = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  return [
    n(removals.apps.length, "application", "applications"),
    n(removals.equipment.length, "device", "devices"),
    n(removals.access.length, "access type", "access types"),
  ]
    .join(", ")
    .replace(/, ([^,]*)$/, " and $1");
}
