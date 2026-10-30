import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { Role } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AdminPerson } from "./users-shared";

/**
 * Everything Admin · Users & roles shows (F18b): every person (active and
 * deactivated) with their roles from the database (admins read all — RLS),
 * plus MFA and last sign-in from Clerk. If Clerk can't be reached the page
 * still works, with "unknown" for those two.
 */
export async function loadUsersAdmin(): Promise<AdminPerson[]> {
  const supabase = createServerSupabaseClient();
  const [users, roles] = await Promise.all([
    supabase
      .from("app_users")
      .select("clerk_user_id, email, first_name, last_name, active"),
    supabase.from("user_roles").select("clerk_user_id, role"),
  ]);
  for (const result of [users, roles]) {
    if (result.error) {
      throw new Error(`Could not load the people: ${result.error.message}`);
    }
  }
  const byUser = new Map<string, Role[]>();
  for (const r of roles.data ?? []) {
    byUser.set(r.clerk_user_id, [
      ...(byUser.get(r.clerk_user_id) ?? []),
      r.role,
    ]);
  }
  const ids = (users.data ?? []).map((u) => u.clerk_user_id);
  const clerk = await clerkFacts(ids);
  return (users.data ?? []).map((u) => ({
    id: u.clerk_user_id,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    roles: byUser.get(u.clerk_user_id) ?? [],
    active: u.active,
    mfa: clerk?.get(u.clerk_user_id)?.mfa ?? null,
    lastSignInAt: clerk
      ? (clerk.get(u.clerk_user_id)?.lastSignInAt ?? null)
      : null,
  }));
}

/** MFA on / last sign-in per Clerk user id, or null when Clerk fails. */
async function clerkFacts(
  ids: string[],
): Promise<Map<string, { mfa: boolean; lastSignInAt: number | null }> | null> {
  if (ids.length === 0) return new Map();
  try {
    const client = await clerkClient();
    const facts = new Map<
      string,
      { mfa: boolean; lastSignInAt: number | null }
    >();
    // Clerk returns at most 100 users per call.
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await client.users.getUserList({
        userId: ids.slice(i, i + 100),
        limit: 100,
      });
      for (const user of data) {
        facts.set(user.id, {
          mfa: user.twoFactorEnabled,
          lastSignInAt: user.lastSignInAt,
        });
      }
    }
    return facts;
  } catch (err) {
    console.error("Clerk users could not be read", err);
    return null;
  }
}
