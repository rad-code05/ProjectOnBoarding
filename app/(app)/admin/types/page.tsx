import { PagePlaceholder } from "@/components/shell";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "Equipment & access types" };

export default async function Page() {
  await requireRole(...PAGES.admin.roles);
  return (
    <PagePlaceholder
      title="Equipment & access types"
      description="The choices in sections 6 and 7 of every new request."
      feature="F19d"
    />
  );
}
