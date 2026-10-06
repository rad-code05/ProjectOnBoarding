import { PagePlaceholder } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "Records" };

export default async function RecordsPage() {
  await requireRole(...PAGES.records.roles);
  return (
    <PagePlaceholder
      title="Records"
      description="Closed requests with their PDF record, to download or save to SharePoint."
      feature="F08"
    />
  );
}
