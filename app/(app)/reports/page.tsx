import { PagePlaceholder } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireRole(...PAGES.reports.roles);
  return (
    <PagePlaceholder
      title="Reports"
      description="Reports on users, onboarding, signatures and access, with CSV and PDF export."
      feature="F12"
    />
  );
}
