import { notFound } from "next/navigation";
import { RequestActivity } from "@/components/audit/RequestActivity";
import { RecordView } from "@/components/records/RecordView";
import { loadRequestActivity } from "@/lib/audit/activity";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { loadRecordPage } from "@/lib/records/page";
import { displayTimezone } from "@/lib/time/display";

export const metadata = { title: "Record" };

/**
 * A closed request's record: the PDF (Download / Preview), signatures and its
 * activity (every record reader, approvers included — decided 2026-10-15).
 */
export default async function RecordPagePage({
  params,
  searchParams,
}: PageProps<"/records/[id]">) {
  const { roles } = await requireRole(...PAGES.records.roles);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [record, activity, timeZone] = await Promise.all([
    loadRecordPage(id),
    loadRequestActivity(id),
    displayTimezone(),
  ]);
  if (!record) notFound();
  return (
    <div className="flex flex-col gap-3.5">
      <RecordView record={record} justClosed={query.closed === "1"} />
      {activity && (
        <RequestActivity
          entries={activity}
          timeZone={timeZone}
          showAuditLink={PAGES.audit.roles.some((r) => roles.includes(r))}
          className="mx-auto w-full max-w-4xl"
        />
      )}
    </div>
  );
}
