"use server";

import * as z from "zod";
import { requireRole } from "@/lib/auth";
import { parseAuditFilters } from "@/lib/audit/filters";
import {
  countAuditEvents,
  loadAuditPage,
  loadAuditPeople,
  type AuditPage,
} from "@/lib/audit/log";
import { PAGES } from "@/lib/navigation";
import { displayTimezone } from "@/lib/time/display";

const query = z.string().max(1000);
const cursor = z.object({
  at: z.iso.datetime({ offset: true }),
  id: z.number().int().positive(),
});

const filtersFrom = (search: string) =>
  parseAuditFilters(Object.fromEntries(new URLSearchParams(search)));

/** "Show 30 more": the next page after the last event shown. */
export async function loadMoreAudit(
  search: string,
  after: { at: string; id: number },
): Promise<AuditPage | null> {
  const { roles } = await requireRole(...PAGES.audit.roles);
  const parsed = z.tuple([query, cursor]).safeParse([search, after]);
  if (!parsed.success) return null;
  const [timeZone, people] = await Promise.all([
    displayTimezone(),
    loadAuditPeople(),
  ]);
  return loadAuditPage(filtersFrom(parsed.data[0]), {
    timeZone,
    people: Object.fromEntries(people.map((p) => [p.id, p.name])),
    canOpenRequests: PAGES.requests.roles.some((r) => roles.includes(r)),
    after: parsed.data[1],
  });
}

/** The filters sheet's "Show N events" while choices change. */
export async function countAudit(search: string): Promise<number | null> {
  await requireRole(...PAGES.audit.roles);
  const parsed = query.safeParse(search);
  if (!parsed.success) return null;
  return countAuditEvents(filtersFrom(parsed.data), await displayTimezone());
}
