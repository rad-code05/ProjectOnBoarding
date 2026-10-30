import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import type { Database } from "@/lib/supabase/database.types";

type SyncArgs = Database["public"]["Functions"]["sync_clerk_user"]["Args"];

/** The fields of a Clerk user that we copy into app_users. */
export type ClerkUserData = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_email_address_id: string | null;
  email_addresses: { id: string; email_address: string }[];
  banned?: boolean;
};

/**
 * Maps a Clerk user to `sync_clerk_user()`'s arguments (email in lower case,
 * as the DB requires; banned in Clerk = deactivated).
 */
export function toSyncArgs(user: ClerkUserData): SyncArgs {
  const primary =
    user.email_addresses.find((e) => e.id === user.primary_email_address_id) ??
    user.email_addresses[0];
  if (!primary) {
    throw new Error(`Clerk user ${user.id} has no email address`);
  }
  return {
    p_clerk_user_id: user.id,
    p_email: primary.email_address.trim().toLowerCase(),
    // Clerk may have no name yet; the column takes null.
    p_first_name: user.first_name as string,
    p_last_name: user.last_name as string,
    p_banned: user.banned ?? false,
  };
}

/**
 * Applies one verified Clerk webhook event to app_users through
 * `sync_clerk_user()` (F18a): a new person with a pending invitation gets its
 * roles; an existing person keeps their active flag (only an admin
 * reactivates; banned in Clerk = deactivated). Users are never deleted (the
 * audit trail and signed records point to them): a deleted Clerk user is
 * deactivated. Returns what happened, for the webhook's log line.
 */
export async function applyClerkUserEvent(
  supabase: SupabaseClient<Database>,
  evt: WebhookEvent,
): Promise<string> {
  switch (evt.type) {
    case "user.created":
    case "user.updated": {
      const { data, error } = await supabase.rpc(
        "sync_clerk_user",
        toSyncArgs(evt.data),
      );
      if (error) throw new Error(`sync_clerk_user failed: ${error.message}`);
      return data;
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
