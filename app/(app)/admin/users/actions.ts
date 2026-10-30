"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { usersErrorMessage } from "@/lib/admin/users-shared";
import { requireRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type UsersResult = { ok: true } | { ok: false; message: string };

const roles = z
  .array(z.enum(["admin", "requester", "it_operator", "approver", "auditor"]))
  .max(5);
const userId = z.string().regex(/^user_\w+$/);

/**
 * Admin · Users & roles (F18b): set another person's roles. The database
 * refuses your own roles, an empty list and taking away the last active
 * approver / admin, and audits every role given or taken.
 */
export async function saveUserRoles(input: {
  userId: string;
  roles: string[];
}): Promise<UsersResult> {
  await requireRole("admin");
  const parsed = z.object({ userId, roles }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the roles." };
  if (parsed.data.roles.length === 0) {
    return {
      ok: false,
      message: "Choose at least one role — to remove everything, deactivate.",
    };
  }
  const { error } = await createServerSupabaseClient().rpc(
    "admin_set_user_roles",
    { p_user: parsed.data.userId, p_roles: parsed.data.roles },
  );
  if (error) {
    return { ok: false, message: usersErrorMessage(error.code, error.message) };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}
