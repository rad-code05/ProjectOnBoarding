import type { SupabaseClient } from "@supabase/supabase-js";
import { COMPANY_TIMEZONE } from "@/lib/requests/format";
import type { Database } from "@/lib/supabase/database.types";
import { isTestAccountEmail, TEST_SITE_SKIP } from "./policy";
import { renderEmail, type EmailFacts } from "./templates";

/**
 * The email sender (F23b-3): claims the due outbox rows, builds each email
 * from fresh facts and sends it. Every row ends as sent, skipped (no longer
 * due, or not a test account on a test site) or failed (tried again 5 / 30
 * minutes later by mark_outbox_failed(); failed for good after 3 tries).
 * Takes the database and the mailer as arguments so tests can pass fakes.
 */
export type Mail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

/** Sends one email. `key` stays the same on every try (no duplicates). */
export type Mailer = (
  mail: Mail,
  key: string,
) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;

export type SendSummary = {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
};

type Facts = { due: boolean; why: string | null; facts: EmailFacts | null };

export async function sendDueEmails(options: {
  db: SupabaseClient<Database>;
  mailer: Mailer;
  testAccountsOnly: boolean;
  from: string;
  baseUrl: string;
  limit?: number;
  /** Wait between two sends (Resend allows a few per second). */
  gapMs?: number;
}): Promise<SendSummary> {
  const { db, mailer } = options;
  const summary: SendSummary = { claimed: 0, sent: 0, skipped: 0, failed: 0 };

  const { data: rows, error } = await db.rpc("claim_outbox", {
    p_limit: options.limit ?? 20,
  });
  if (error) throw new Error(`Could not claim emails: ${error.message}`);
  if (!rows?.length) return summary;
  summary.claimed = rows.length;

  const timeZone = await companyTimeZone(db);
  const gap = options.gapMs ?? 600;
  let sentBefore = false;

  const skip = async (id: number, reason: string) => {
    await db.rpc("mark_outbox_skipped", { p_id: id, p_reason: reason });
    summary.skipped++;
  };
  const fail = async (id: number, reason: string) => {
    await db.rpc("mark_outbox_failed", { p_id: id, p_error: reason });
    summary.failed++;
  };

  for (const row of rows) {
    try {
      if (options.testAccountsOnly && !isTestAccountEmail(row.to_email)) {
        await skip(row.id, TEST_SITE_SKIP);
        continue;
      }
      const { data, error: factsError } = await db.rpc("outbox_email_facts", {
        p_id: row.id,
      });
      if (factsError) {
        await fail(row.id, `Facts not read: ${factsError.message}`);
        continue;
      }
      const result = data as Facts | null;
      if (!result?.due || !result.facts) {
        await skip(row.id, result?.why ?? "No longer due.");
        continue;
      }

      const email = renderEmail(result.facts, {
        baseUrl: options.baseUrl,
        timeZone,
      });
      if (sentBefore && gap > 0) await wait(gap);
      sentBefore = true;
      const sent = await mailer(
        { from: options.from, to: row.to_email, ...email },
        `laine-outbox-${row.id}`,
      );
      if (sent.ok) {
        await db.rpc("mark_outbox_sent", {
          p_id: row.id,
          p_provider_id: sent.id,
        });
        summary.sent++;
      } else {
        await fail(row.id, sent.error);
      }
    } catch (cause) {
      await fail(
        row.id,
        cause instanceof Error ? cause.message : String(cause),
      );
    }
  }
  return summary;
}

/** Times in emails use the company timezone (D3), like the PDF. */
async function companyTimeZone(db: SupabaseClient<Database>): Promise<string> {
  const { data } = await db
    .from("app_settings")
    .select("company_timezone")
    .maybeSingle();
  return data?.company_timezone || COMPANY_TIMEZONE;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
