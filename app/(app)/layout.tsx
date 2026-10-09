import { currentUser } from "@clerk/nextjs/server";
import { AppShell } from "@/components/shell";
import { getCurrentUser } from "@/lib/auth";
import { countWaiting } from "@/lib/approvals/list";
import { PAGES, navFor, roleSummary } from "@/lib/navigation";

/**
 * Shell for all signed-in pages. It only loads what the top bar shows —
 * layouts don't re-run on navigation, so every page does its own
 * requireRole() check (Next.js "Layouts and auth checks").
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { roles } = await getCurrentUser();
  const [user, waiting] = await Promise.all([
    currentUser(),
    roles.includes("approver") ? countWaiting() : Promise.resolve(0),
  ]);
  // Approvers see how many requests wait for them (design: menu badge).
  const items = navFor(roles).map((item) =>
    item.href === PAGES.approvals.href && waiting > 0
      ? { ...item, badge: waiting }
      : item,
  );
  const userName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.primaryEmailAddress?.emailAddress ||
    "Signed in";

  return (
    <AppShell items={items} userName={userName} userRole={roleSummary(roles)}>
      {children}
    </AppShell>
  );
}
