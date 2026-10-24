import Link from "next/link";
import { AiSettingsForm } from "@/components/admin/AiSettingsForm";
import { ChevronLeftIcon } from "@/components/ui";
import { loadAiSettings } from "@/lib/admin/ai";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "AI settings" };

/** Admin → AI settings (F15e, board: Phone · Admin · AI settings). */
export default async function AdminAiPage() {
  await requireRole(...PAGES.admin.roles);
  const view = await loadAiSettings();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link
        href="/admin"
        className="-ml-2 flex h-11 items-center gap-1 self-start px-2 text-sm font-semibold"
      >
        <ChevronLeftIcon size={18} />
        Admin
      </Link>
      <h1 className="font-serif text-[32px] leading-tight">AI settings</h1>
      <AiSettingsForm view={view} />
    </div>
  );
}
