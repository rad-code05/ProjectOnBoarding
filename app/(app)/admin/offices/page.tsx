import { OfficesAdmin } from "@/components/admin/OfficesAdmin";
import { loadOfficesAdmin } from "@/lib/admin/offices";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "Offices" };

/** Admin · Offices — add, change, retire, restore; US cities per state (F27b). */
export default async function AdminOfficesPage() {
  await requireRole(...PAGES.admin.roles);
  const { offices, regions, cities } = await loadOfficesAdmin();
  return <OfficesAdmin offices={offices} regions={regions} cities={cities} />;
}
