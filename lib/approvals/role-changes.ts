import "server-only";
import { formatDayTime } from "@/lib/requests/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { displayTimezone } from "@/lib/time/display";
import {
  roleChangeLines,
  type RoleChangeEvent,
  type RoleChangeLine,
} from "./role-changes-shared";

const PAGE = 30;

export type RoleChangesPage = {
  lines: (RoleChangeLine & { when: string })[];
  /** Where "Show older" continues, or null at the end. */
  before: string | null;
};

/**
 * Role changes for the approver's card (F18d-2, D5): `role_changes()`
 * (approvers / admins / auditors, names included, test users hidden from
 * real people), newest first, grouped into lines, times in the reader's
 * timezone.
 */
export async function loadRoleChanges(
  before: string | null = null,
): Promise<RoleChangesPage> {
  const supabase = createServerSupabaseClient();
  const [{ data, error }, timeZone] = await Promise.all([
    supabase.rpc("role_changes", {
      ...(before ? { p_before: before } : {}),
      p_limit: PAGE,
    }),
    displayTimezone(),
  ]);
  if (error) throw new Error(`Could not load role changes: ${error.message}`);
  const events = (data ?? []) as RoleChangeEvent[];
  return {
    lines: roleChangeLines(events).map((line) => ({
      ...line,
      when: formatDayTime(line.at, timeZone),
    })),
    before: events.length === PAGE ? events.at(-1)!.created_at : null,
  };
}

/**
 * The card on Approvals: the last 30 days only (no card when nothing
 * changed); "Show older" continues before the oldest line shown.
 */
export async function recentRoleChanges(): Promise<{
  lines: RoleChangesPage["lines"];
  older: string | null;
}> {
  const page = await loadRoleChanges();
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const lines = page.lines.filter((l) => new Date(l.at).getTime() >= since);
  const more = lines.length < page.lines.length || page.before !== null;
  return { lines, older: more ? (lines.at(-1)?.at ?? null) : null };
}
