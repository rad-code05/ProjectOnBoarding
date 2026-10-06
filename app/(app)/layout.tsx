import { currentUser } from "@clerk/nextjs/server";
import { AppShell } from "@/components/shell";
import { getCurrentUser } from "@/lib/auth";
import { navFor, roleSummary } from "@/lib/navigation";

/**
 * Shell for all signed-in pages. It only loads what the top bar shows —
 * layouts don't re-run on navigation, so every page does its own
 * requireRole() check (Next.js "Layouts and auth checks").
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { roles } = await getCurrentUser();
  const user = await currentUser();
  const userName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.primaryEmailAddress?.emailAddress ||
    "Signed in";

  return (
    <AppShell
      items={navFor(roles)}
      userName={userName}
      userRole={roleSummary(roles)}
    >
      {children}
    </AppShell>
  );
}
