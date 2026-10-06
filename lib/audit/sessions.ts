import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import type { Database } from "@/lib/supabase/database.types";

/** Clerk session events we record. The action in the audit log keeps Clerk's name. */
export const SESSION_EVENTS = [
  "session.created", // signed in
  "session.ended", // signed out (session kept on the device)
  "session.removed", // signed out (session removed from the device)
  "session.revoked", // ended by an admin or the app
] as const;

type SessionEventType = (typeof SESSION_EVENTS)[number];

export function isSessionEvent(
  evt: WebhookEvent,
): evt is Extract<WebhookEvent, { type: SessionEventType }> {
  return (SESSION_EVENTS as readonly string[]).includes(evt.type);
}

/**
 * Writes one verified Clerk session event to the append-only audit log
 * (PROJECT_PLAN §10.2: sign-in/out). The database sets the timestamp.
 * Session expiry has no webhook in Clerk, so time-outs are not logged.
 * No IP address or device details: the data policy is still open.
 */
export async function logClerkSessionEvent(
  supabase: SupabaseClient<Database>,
  evt: Extract<WebhookEvent, { type: SessionEventType }>,
  webhookId: string | null,
): Promise<"logged"> {
  const session = evt.data;
  const { error } = await supabase.from("audit_events").insert({
    actor_id: session.user_id,
    action: evt.type,
    entity: "session",
    entity_id: session.id,
    // Revoked = the app or an admin ended it, not the user.
    source: evt.type === "session.revoked" ? "system" : "user",
    diff: {
      status: session.status,
      client_id: session.client_id,
      ...(webhookId ? { webhook_id: webhookId } : {}),
    },
  });
  if (error) throw new Error(`audit_events insert failed: ${error.message}`);
  return "logged";
}
