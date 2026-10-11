import { notFound } from "next/navigation";
import { RecordView } from "@/components/records/RecordView";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { loadRecordPage } from "@/lib/records/page";

export const metadata = { title: "Record" };

/** A closed request's record: the PDF (Download / Preview) and signatures. */
export default async function RecordPagePage({
  params,
  searchParams,
}: PageProps<"/records/[id]">) {
  await requireRole(...PAGES.records.roles);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const record = await loadRecordPage(id);
  if (!record) notFound();
  return <RecordView record={record} justClosed={query.closed === "1"} />;
}
