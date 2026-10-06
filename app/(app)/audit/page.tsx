import { PagePlaceholder } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "Audit log" };

export default async function AuditLogPage() {
  await requireRole(...PAGES.audit.roles);
  return (
    <PagePlaceholder
      title="Audit log"
      description="Every sign-in, change, signature and export — who, what and when."
      feature="F11"
    />
  );
}
