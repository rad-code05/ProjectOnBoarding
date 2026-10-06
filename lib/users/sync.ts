import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import type { Database } from "@/lib/supabase/database.types";

type AppUserRow = Database["public"]["Tables"]["app_users"]["Insert"];

/** The fields of a Clerk user that we copy into app_users. */
export type ClerkUserData = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_email_address_id: string | null;
  email_addresses: { id: string; email_address: string }[];
};

/** Maps a Clerk user to an app_users row (email in lower case, as the DB requires). */
export function toAppUserRow(user: ClerkUserData): AppUserRow {
  const primary =
    user.email_addresses.find((e) => e.id === user.primary_email_address_id) ??
    user.email_addresses[0];
  if (!primary) {
    throw new Error(`Clerk user ${user.id} has no email address`);
  }
  return {
    clerk_user_id: user.id,
    email: primary.email_address.trim().toLowerCase(),
    first_name: user.first_name,
    last_name: user.last_name,
    active: true,
  };
}

/**
 * Applies one verified Clerk webhook event to app_users.
 * Users are never deleted (the audit trail and signed records point to them):
 * a deleted Clerk user is deactivated. Roles are not touched here.
 * Returns what happened, for the webhook's log line.
 */
export async function applyClerkUserEvent(
  supabase: SupabaseClient<Database>,
  evt: WebhookEvent,
): Promise<"upserted" | "deactivated" | "ignored"> {
  switch (evt.type) {
    case "user.created":
    case "user.updated": {
      const { error } = await supabase
        .from("app_users")
        .upsert(toAppUserRow(evt.data), { onConflict: "clerk_user_id" });
      if (error) throw new Error(`app_users upsert failed: ${error.message}`);
      return "upserted";
    }
    case "user.deleted": {
      if (!evt.data.id) return "ignored";
      const { error } = await supabase
        .from("app_users")
        .update({ active: false })
        .eq("clerk_user_id", evt.data.id);
      if (error)
        throw new Error(`app_users deactivate failed: ${error.message}`);
      return "deactivated";
    }
    default:
      return "ignored";
  }
}
