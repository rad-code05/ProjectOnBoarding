import "server-only";
import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type Role = Database["public"]["Enums"]["app_role"];

/**
 * Call at the top of EVERY page, Route Handler and Server Action that needs a
 * signed-in user. Signed-out page requests are redirected to /sign-in;
 * other requests get 404. (Clerk recommends per-resource checks over
 * middleware route matchers.)
 */
export async function requireUser() {
  const { userId } = await auth.protect();
  return { userId };
}

/**
 * The signed-in user's roles, read from Supabase with their own Clerk token —
 * RLS returns only their roles, and none if the account is deactivated or not
 * yet synced. Cached per request.
 */
export const getCurrentUser = cache(async () => {
  const { userId } = await requireUser();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("clerk_user_id", userId);
  if (error) {
    throw new Error(`Could not load roles: ${error.message}`);
  }
  return { userId, roles: data.map((row) => row.role) };
});

/**
 * Allows the request only if the signed-in user holds at least one of the
 * given roles; otherwise renders the 404 page (we don't reveal that the page
 * exists). Use in pages, Route Handlers and Server Actions — never rely on
 * hiding a link.
 */
export async function requireRole(...allowed: [Role, ...Role[]]) {
  const user = await getCurrentUser();
  if (!user.roles.some((role) => allowed.includes(role))) {
    notFound();
  }
  return user;
}
