import { AppsAdmin } from "@/components/admin/AppsAdmin";
import { loadCatalogAdmin } from "@/lib/admin/catalog";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "Applications" };

/** Admin · Applications — add, change, retire and restore (F19c). */
export default async function AdminApplicationsPage() {
  await requireRole(...PAGES.admin.roles);
  const { categories, apps } = await loadCatalogAdmin();
  return <AppsAdmin categories={categories} apps={apps} />;
}
