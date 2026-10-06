import { PagePlaceholder } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireRole(...PAGES.admin.roles);
  return (
    <PagePlaceholder
      title="Admin"
      description="Users and roles, applications, form fields, templates and defaults."
      feature="F18"
    />
  );
}
