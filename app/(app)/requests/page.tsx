import { PagePlaceholder } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "Requests" };

export default async function RequestsPage() {
  await requireRole(...PAGES.requests.roles);
  return (
    <PagePlaceholder
      title="Requests"
      description="Everyone being onboarded, offboarded or changed — with New request and Batch onboarding."
      feature="F01"
    />
  );
}
