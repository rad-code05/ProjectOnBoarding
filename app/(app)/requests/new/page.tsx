import { PagePlaceholder } from "@/components/shell";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "New request" };

/** Replaced by the request form in F01d. */
export default async function NewRequestPage() {
  await requireRole("admin", "requester");
  return (
    <PagePlaceholder
      title="New request"
      description="The onboarding form — ticket information and employee details, saved as a draft while you work."
      feature="F01d"
    />
  );
}
