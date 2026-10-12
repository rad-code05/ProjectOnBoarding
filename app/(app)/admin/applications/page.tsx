import { PagePlaceholder } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "Applications" };

export default async function Page() {
  await requireRole(...PAGES.admin.roles);
  return (
    <PagePlaceholder
      title="Applications"
      description="The tools in section 5 of every new request: add, change, retire."
      feature="F19c"
    />
  );
}
