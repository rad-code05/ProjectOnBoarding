import { AuditLog } from "@/components/audit/AuditLog";
import { requireRole } from "@/lib/auth";
import { parseAuditFilters } from "@/lib/audit/filters";
import { loadAuditPage, loadAuditPeople } from "@/lib/audit/log";
import { PAGES } from "@/lib/navigation";
import { displayTimezone } from "@/lib/time/display";

export const metadata = { title: "Audit log" };

/**
 * Every sign-in, change, signature and download — admins and auditors
 * (boards: Phone · Audit log, Audit log filters, Audit event details).
 */
export default async function AuditLogPage({
  searchParams,
}: PageProps<"/audit">) {
  const { roles } = await requireRole(...PAGES.audit.roles);
  const filters = parseAuditFilters(await searchParams);
  const [timeZone, people] = await Promise.all([
    displayTimezone(),
    loadAuditPeople(),
  ]);
  const page = await loadAuditPage(filters, {
    timeZone,
    people: Object.fromEntries(people.map((p) => [p.id, p.name])),
    canOpenRequests: PAGES.requests.roles.some((r) => roles.includes(r)),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[34px] leading-tight md:text-[32px]">
          Audit log
        </h1>
        <p className="text-sm leading-normal text-graphite">
          Every sign-in, change, signature and download. Append-only — nobody
          can edit or delete an entry.
        </p>
      </div>
      <AuditLog
        filters={filters}
        initial={page}
        people={people}
        timeZone={timeZone}
      />
    </div>
  );
}
