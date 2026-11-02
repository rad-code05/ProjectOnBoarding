import Link from "next/link";
import { NotificationsAdmin } from "@/components/admin/NotificationsAdmin";
import { ChevronLeftIcon } from "@/components/ui";
import { loadNotifications } from "@/lib/admin/notifications";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "Notifications" };

/** Admin → Notifications (F23c, board: Phone · Admin · Notifications). */
export default async function AdminNotificationsPage() {
  await requireRole(...PAGES.admin.roles);
  const view = await loadNotifications();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link
        href="/admin"
        className="-ml-2 flex h-11 items-center gap-1 self-start px-2 text-sm font-semibold"
      >
        <ChevronLeftIcon size={18} />
        Admin
      </Link>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[32px] leading-tight">Notifications</h1>
        <p className="text-sm leading-normal text-graphite">
          Emails the app sends when something needs someone. Every email is
          recorded below.
        </p>
      </div>
      <NotificationsAdmin view={view} />
    </div>
  );
}
