import { UsersAdmin } from "@/components/admin/UsersAdmin";
import { loadUsersAdmin } from "@/lib/admin/users";
import { personMeta } from "@/lib/admin/users-shared";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { formatDayTime } from "@/lib/requests/format";
import { displayTimezone } from "@/lib/time/display";

export const metadata = { title: "Users & roles" };

/** Admin · Users & roles — people, their roles, MFA and last sign-in (F18b). */
export default async function AdminUsersPage() {
  const { userId } = await requireRole(...PAGES.admin.roles);
  const [people, timeZone] = await Promise.all([
    loadUsersAdmin(),
    displayTimezone(),
  ]);
  const meta = Object.fromEntries(
    people.map((p) => [
      p.id,
      personMeta(
        p,
        p.lastSignInAt === null
          ? null
          : formatDayTime(new Date(p.lastSignInAt).toISOString(), timeZone),
      ),
    ]),
  );
  return <UsersAdmin people={people} you={userId} meta={meta} />;
}
