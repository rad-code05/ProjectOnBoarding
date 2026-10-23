import { currentUser } from "@clerk/nextjs/server";
import { Assistant } from "@/components/assistant/Assistant";
import { AppShell } from "@/components/shell";
import { reportFromLink } from "@/lib/ai/memory";
import { hasAnyRole } from "@/lib/ai/tools/types";
import { getCurrentUser } from "@/lib/auth";
import { countWaiting } from "@/lib/approvals/list";
import { PAGES, navFor, roleSummary } from "@/lib/navigation";
import { reportInfo } from "@/lib/reports/catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Shell for all signed-in pages. It only loads what the top bar shows —
 * layouts don't re-run on navigation, so every page does its own
 * requireRole() check (Next.js "Layouts and auth checks").
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { roles } = await getCurrentUser();
  const supabase = createServerSupabaseClient();
  const [user, waiting, ai, memory] = await Promise.all([
    currentUser(),
    roles.includes("approver") ? countWaiting() : Promise.resolve(0),
    supabase.from("ai_settings").select("enabled").maybeSingle(),
    supabase
      .from("ai_memory")
      .select("call_me, favourite_reports")
      .maybeSingle(),
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

  // The Laine robot (F15c): for everyone with a role, while it is on.
  const assistant = roles.length > 0 && ai.data?.enabled === true;
  // The greeting bubble (F15d-2d): their latest report, if they read reports.
  const favourite = hasAnyRole(roles, PAGES.reports.roles)
    ? reportFromLink(`/reports/${memory.data?.favourite_reports?.[0] ?? ""}`)
    : null;

  return (
    <AppShell items={items} userName={userName} userRole={roleSummary(roles)}>
      {children}
      {assistant && (
        <Assistant
          name={memory.data?.call_me || user?.firstName || "there"}
          roles={roles}
          favourite={
            favourite
              ? {
                  name: reportInfo(favourite).name,
                  href: `/reports/${favourite}`,
                }
              : null
          }
        />
      )}
    </AppShell>
  );
}
