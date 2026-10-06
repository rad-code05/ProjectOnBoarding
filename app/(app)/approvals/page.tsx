import { PagePlaceholder } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  await requireRole(...PAGES.approvals.roles);
  return (
    <PagePlaceholder
      title="Approvals"
      description="Requests Raju has signed that are waiting for your confirmation."
      feature="F07"
    />
  );
}
