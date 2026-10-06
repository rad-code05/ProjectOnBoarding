import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { isSessionEvent, logClerkSessionEvent } from "@/lib/audit/sessions";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { applyClerkUserEvent } from "@/lib/users/sync";

/**
 * Clerk → Supabase: user sync (user.*) and sign-in/out audit (session.*).
 * Public on purpose (Clerk calls it, nobody is signed in), so the FIRST thing
 * it does is verify Clerk's signature with CLERK_WEBHOOK_SIGNING_SECRET.
 * Unsigned or tampered requests get 400. A failed database write returns 500
 * so Clerk retries the event.
 */
export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  try {
    const supabase = createAdminSupabaseClient();
    const result = isSessionEvent(evt)
      ? await logClerkSessionEvent(supabase, evt, req.headers.get("svix-id"))
      : await applyClerkUserEvent(supabase, evt);
    console.info(`Clerk webhook ${evt.type}: ${result}`);
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error(`Clerk webhook ${evt.type} failed`, err);
    return new Response("Sync failed", { status: 500 });
  }
}
