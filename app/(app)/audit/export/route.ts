import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { auditCsv } from "@/lib/audit/csv";
import { parseAuditFilters } from "@/lib/audit/filters";
import { filterArgs, loadAuditPeople } from "@/lib/audit/log";
import { PAGES } from "@/lib/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { displayTimezone } from "@/lib/time/display";
import { zonedParts } from "@/lib/time/zoned";

/**
 * GET /audit/export?<the page's filters> — the events those filters match as
 * CSV (admins and auditors, max 10 000). export_audit_log() writes the
 * export itself to the audit log ("audit.exported", with filters and rows).
 */
export async function GET(request: NextRequest) {
  await requireRole(...PAGES.audit.roles);
  const filters = parseAuditFilters(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  const [timeZone, people] = await Promise.all([
    displayTimezone(),
    loadAuditPeople(),
  ]);

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc(
    "export_audit_log",
    filterArgs(filters, timeZone),
  );
  if (error) {
    return new Response("Could not export the audit log.", {
      status: error.code === "42501" ? 403 : 500,
    });
  }

  const csv = auditCsv(
    data ?? [],
    timeZone,
    Object.fromEntries(people.map((p) => [p.id, p.name])),
  );
  const day = zonedParts(new Date().toISOString(), timeZone).date;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${day}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
