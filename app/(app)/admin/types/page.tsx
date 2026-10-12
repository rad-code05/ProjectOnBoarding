import { TypesAdmin } from "@/components/admin/TypesAdmin";
import { loadTypesAdmin } from "@/lib/admin/catalog";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "Equipment & access types" };

/** Admin · Equipment & access types — add, change, retire, restore (F19d). */
export default async function AdminTypesPage() {
  await requireRole(...PAGES.admin.roles);
  const { equipment, access } = await loadTypesAdmin();
  return <TypesAdmin equipment={equipment} access={access} />;
}
