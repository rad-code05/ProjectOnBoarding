"use server";

import * as z from "zod";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const SECURITY_CHANGES = [
  "password_changed",
  "authenticator_replaced",
  "backup_codes_regenerated",
] as const;

export type SecurityChange = (typeof SECURITY_CHANGES)[number];

/**
 * Adds a password / MFA change to the audit log. The change itself happens
 * in Clerk (from the browser, after "Confirm it's you"), so this only
 * records it — in the signed-in user's own name; RLS allows nothing else.
 * Clerk's dashboard keeps its own record too.
 */
export async function recordSecurityChange(
  change: SecurityChange,
): Promise<{ ok: boolean }> {
  const { userId } = await requireUser();
  const parsed = z.enum(SECURITY_CHANGES).safeParse(change);
  if (!parsed.success) return { ok: false };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("audit_events").insert({
    actor_id: userId,
    action: `account.${parsed.data}`,
    entity: "user",
    entity_id: userId,
    source: "user",
  });
  if (error) console.error("audit_events insert failed", error.message);
  return { ok: !error };
}
