import { bearerMatches, runSender } from "@/lib/notifications/run";

export const maxDuration = 60;

/**
 * The email sender (F23b-3). Called every 5 minutes by the database
 * (pg_cron + pg_net, `private.call_email_sender()`) when an email is due.
 * Public on purpose (nobody is signed in), so the FIRST thing it does is
 * check the shared secret EMAIL_SENDER_SECRET (also in Supabase Vault as
 * `email_sender_secret`). Without the secret the route stays closed.
 */
export async function POST(req: Request) {
  const secret = process.env.EMAIL_SENDER_SECRET;
  if (!secret) return new Response("Sender not set up", { status: 503 });
  if (!bearerMatches(req.headers.get("authorization"), secret))
    return new Response("Unauthorized", { status: 401 });

  try {
    const result = await runSender(new URL(req.url).origin);
    return Response.json(result);
  } catch (cause) {
    console.error("Email sender failed", cause);
    return new Response("Sender failed", { status: 500 });
  }
}
