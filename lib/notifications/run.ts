import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { Resend } from "resend";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { senderAddress, sendMode } from "./policy";
import { sendDueEmails, type Mailer, type SendSummary } from "./sender";

/** Resend as the mailer. Errors come back as values (nothing is thrown). */
function resendMailer(apiKey: string): Mailer {
  const resend = new Resend(apiKey);
  return async (mail, key) => {
    const { data, error } = await resend.emails.send(mail, {
      idempotencyKey: key,
    });
    if (error)
      return {
        ok: false,
        error: `Resend ${error.statusCode ?? "network"} ${error.name}: ${error.message}`,
      };
    return { ok: true, id: data.id };
  };
}

export type SenderResult =
  | { mode: "off"; reason: string }
  | ({ mode: "test_accounts" | "everyone" } & SendSummary);

/** Sends what is due, as this site may (see policy.ts). */
export async function runSender(baseUrl: string): Promise<SenderResult> {
  const env = process.env;
  const mode = sendMode(env);
  if (mode.mode === "off") return mode;
  const summary = await sendDueEmails({
    db: createAdminSupabaseClient(),
    mailer: resendMailer(env.RESEND_API_KEY!),
    testAccountsOnly: mode.mode === "test_accounts",
    from: senderAddress(env),
    baseUrl: env.APP_URL?.trim() || baseUrl,
  });
  return { mode: mode.mode, ...summary };
}

/**
 * After sign / return / confirm: send the new emails straight away instead
 * of waiting up to 5 minutes for the scheduled call. Runs after the response;
 * a failure only logs (the schedule picks the emails up).
 */
export function nudgeSender() {
  after(async () => {
    try {
      const result = await runSender(await siteOrigin());
      if (result.mode !== "off" && result.claimed)
        console.info("Emails sent after an action", result);
    } catch (cause) {
      console.error("Email nudge failed", cause);
    }
  });
}

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** `Authorization: Bearer <secret>`, compared in constant time. */
export function bearerMatches(header: string | null, secret: string): boolean {
  const given = header?.match(/^Bearer\s+(.+)$/)?.[1]?.trim();
  if (!given || !secret) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
