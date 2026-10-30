import { UsersAdmin } from "@/components/admin/UsersAdmin";
import { loadInvitations, loadUsersAdmin } from "@/lib/admin/users";
import { invitationLine, personMeta } from "@/lib/admin/users-shared";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { formatDay, formatDayTime } from "@/lib/requests/format";
import { displayTimezone } from "@/lib/time/display";

export const metadata = { title: "Users & roles" };

/** Admin · Users & roles — people, roles, MFA, last sign-in (F18b); invitations (F18c). */
export default async function AdminUsersPage() {
  const { userId } = await requireRole(...PAGES.admin.roles);
  const [people, invitations, timeZone] = await Promise.all([
    loadUsersAdmin(),
    loadInvitations(),
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
  const invitationLines = Object.fromEntries(
    invitations.map((i) => [
      i.id,
      invitationLine(
        i,
        formatDayTime(i.createdAt, timeZone),
        formatDay(i.expiresAt, timeZone),
      ),
    ]),
  );
  return (
    <UsersAdmin
      people={people}
      you={userId}
      meta={meta}
      invitations={invitations}
      invitationLines={invitationLines}
    />
  );
}
