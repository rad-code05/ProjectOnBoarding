import type { Database } from "@/lib/supabase/database.types";

type Role = Database["public"]["Enums"]["app_role"];

export type NavItem = {
  href: string;
  label: string;
  /** Who may open the page. Pages enforce this with requireRole(). */
  roles: readonly [Role, ...Role[]];
};

/**
 * Main menu, in display order. One list drives both the top bar and each
 * page's server-side check, so they can't drift apart (ROLES.md):
 * Raju → Requests · Reports · Audit log · Admin; approver → Approvals · Records · Reports.
 */
export const PAGES = {
  requests: {
    href: "/requests",
    label: "Requests",
    roles: ["admin", "requester", "it_operator"],
  },
  approvals: { href: "/approvals", label: "Approvals", roles: ["approver"] },
  records: {
    href: "/records",
    label: "Records",
    roles: ["approver", "auditor"],
  },
  reports: {
    href: "/reports",
    label: "Reports",
    roles: ["admin", "approver", "auditor"],
  },
  audit: { href: "/audit", label: "Audit log", roles: ["admin", "auditor"] },
  admin: { href: "/admin", label: "Admin", roles: ["admin"] },
} as const satisfies Record<string, NavItem>;

const NAV_ORDER = [
  PAGES.requests,
  PAGES.approvals,
  PAGES.records,
  PAGES.reports,
  PAGES.audit,
  PAGES.admin,
] as const;

/** Menu items the user may see. Hiding a link is not security — pages check too. */
export function navFor(roles: readonly Role[]): NavItem[] {
  return NAV_ORDER.filter((item) =>
    item.roles.some((role) => roles.includes(role)),
  );
}

/** Start page after sign-in: the first menu item, or null without roles. */
export function landingFor(roles: readonly Role[]): string | null {
  return navFor(roles)[0]?.href ?? null;
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  requester: "Requester",
  it_operator: "IT operator",
  approver: "Approver",
  auditor: "Auditor",
};

/** Short role line under the name in the top bar, e.g. "Admin · IT operator". */
export function roleSummary(roles: readonly Role[]): string {
  const shown = (["admin", "it_operator", "approver", "auditor"] as const)
    .filter((role) => roles.includes(role))
    .map((role) => ROLE_LABELS[role]);
  if (shown.length === 0 && roles.includes("requester")) {
    return ROLE_LABELS.requester;
  }
  return shown.join(" · ");
}
