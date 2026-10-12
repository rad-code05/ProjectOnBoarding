import Link from "next/link";
import { CompanyTimezoneCard } from "@/components/admin/CompanyTimezoneCard";
import { ChevronLeftIcon } from "@/components/ui";
import { loadCompanySettings } from "@/lib/admin/overview";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "Settings" };

/** Admin → Settings (board: Phone · Admin · Settings). */
export default async function AdminSettingsPage() {
  await requireRole(...PAGES.admin.roles);
  const settings = await loadCompanySettings();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link
        href="/admin"
        className="-ml-2 flex h-11 items-center gap-1 self-start px-2 text-sm font-semibold"
      >
        <ChevronLeftIcon size={18} />
        Admin
      </Link>
      <h1 className="font-serif text-[32px] leading-tight">Settings</h1>
      <CompanyTimezoneCard
        timezone={settings.timezone}
        lastChanged={settings.lastChanged}
      />
      <p className="text-xs leading-normal text-graphite">
        More settings (defaults, SLA, PDF naming, SharePoint) come with
        Templates &amp; defaults.
      </p>
    </div>
  );
}
