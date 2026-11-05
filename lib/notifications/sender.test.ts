import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { LIVE_SITE_SKIP, TEST_SITE_SKIP } from "./policy";
import { sendDueEmails, type Mailer } from "./sender";
import type { EmailFacts } from "./templates";

const ADMIN = "e2e.admin+clerk_test@laine.ai";
/** A real person: the live site emails them. */
const PERSON = "rita.requestor@example.com";

const facts = (id: string): EmailFacts => ({
  kind: "waiting",
  request: {
    id,
    ticket: "UAM-2026-000042",
    type: "onboarding",
    firstName: "Leila",
    lastName: "Haddad",
    effectiveDate: "2026-11-16",
    lastWorkingDay: null,
    waitingSince: "2026-11-02T08:00:00Z",
  },
  itSigner: { name: "Raju Bholani", signedAt: "2026-11-02T08:00:00Z" },
  decision: null,
  pdfFileName: null,
  sla: null,
});

type Row = { id: number; to_email: string };

/** A stand-in database: claim_outbox returns `rows`; marks are recorded. */
function fakeDb(
  rows: Row[],
  factsFor: (id: number) => unknown,
  options: { factsError?: boolean } = {},
) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "claim_outbox") return { data: rows, error: null };
      if (fn === "outbox_email_facts")
        return options.factsError
          ? { data: null, error: { message: "boom" } }
          : { data: factsFor(args.p_id as number), error: null };
      return { data: null, error: null };
    }),
    from: () => ({
      select: () => ({
        maybeSingle: async () => ({
          data: { company_timezone: "Asia/Dubai" },
          error: null,
        }),
      }),
    }),
  };
  const marks = () =>
    calls
      .filter((c) => c.fn.startsWith("mark_outbox_"))
      .map((c) => [
        c.fn,
        c.args.p_id,
        c.args.p_reason ?? c.args.p_error ?? c.args.p_provider_id,
      ]);
  return { db: db as unknown as SupabaseClient<Database>, calls, marks };
}

const due = (id: number) => ({
  due: true,
  why: null,
  facts: facts(`req-${id}`),
});

describe("sendDueEmails", () => {
  let mailer: ReturnType<typeof vi.fn<Mailer>>;
  beforeEach(() => {
    mailer = vi.fn<Mailer>(async () => ({ ok: true, id: "re_1" }));
  });
  const run = (db: SupabaseClient<Database>, testAccountsOnly = false) =>
    sendDueEmails({
      db,
      mailer,
      testAccountsOnly,
      from: "Laine <no-reply@access-notify.laine.ai>",
      baseUrl: "https://app.example/",
      gapMs: 0,
    });

  it("does nothing when no email is due", async () => {
    const { db, calls } = fakeDb([], due);
    expect(await run(db)).toEqual({
      claimed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    });
    expect(calls.map((c) => c.fn)).toEqual(["claim_outbox"]);
    expect(mailer).not.toHaveBeenCalled();
  });

  it("sends a due email and marks it sent with Resend's id", async () => {
    const { db, marks } = fakeDb([{ id: 7, to_email: PERSON }], due);
    expect(await run(db)).toMatchObject({ claimed: 1, sent: 1 });
    const [mail, key] = mailer.mock.calls[0]!;
    expect(key).toBe("laine-outbox-7");
    expect(mail.to).toBe(PERSON);
    expect(mail.from).toBe("Laine <no-reply@access-notify.laine.ai>");
    expect(mail.subject).toContain("Leila Haddad");
    expect(mail.html).toContain("https://app.example/approvals/req-7");
    expect(marks()).toEqual([["mark_outbox_sent", 7, "re_1"]]);
  });

  it("skips an email that is no longer due, with the database's reason", async () => {
    const { db, marks } = fakeDb([{ id: 8, to_email: PERSON }], () => ({
      due: false,
      why: "no longer waiting for confirmation",
      facts: null,
    }));
    expect(await run(db)).toMatchObject({ skipped: 1, sent: 0 });
    expect(mailer).not.toHaveBeenCalled();
    expect(marks()).toEqual([
      ["mark_outbox_skipped", 8, "no longer waiting for confirmation"],
    ]);
  });

  it("on the live site, skips the test accounts unread (no real mailbox)", async () => {
    const { db, marks, calls } = fakeDb(
      [
        { id: 1, to_email: ADMIN },
        { id: 2, to_email: "rbh@laine.ai" },
      ],
      due,
    );
    expect(await run(db)).toMatchObject({ claimed: 2, sent: 1, skipped: 1 });
    expect(mailer).toHaveBeenCalledTimes(1);
    expect(mailer.mock.calls[0]![0].to).toBe("rbh@laine.ai");
    expect(marks()).toEqual([
      ["mark_outbox_skipped", 1, LIVE_SITE_SKIP],
      ["mark_outbox_sent", 2, "re_1"],
    ]);
    expect(
      calls
        .filter((c) => c.fn === "outbox_email_facts")
        .map((c) => c.args.p_id),
    ).toEqual([2]);
  });

  it("on a test site, emails only the test accounts — others are skipped unread", async () => {
    const { db, marks, calls } = fakeDb(
      [
        { id: 1, to_email: "rbh@laine.ai" },
        { id: 2, to_email: ADMIN },
      ],
      due,
    );
    expect(await run(db, true)).toMatchObject({
      claimed: 2,
      sent: 1,
      skipped: 1,
    });
    expect(mailer).toHaveBeenCalledTimes(1);
    expect(mailer.mock.calls[0]![0].to).toBe(ADMIN);
    expect(marks()).toEqual([
      ["mark_outbox_skipped", 1, TEST_SITE_SKIP],
      ["mark_outbox_sent", 2, "re_1"],
    ]);
    expect(
      calls
        .filter((c) => c.fn === "outbox_email_facts")
        .map((c) => c.args.p_id),
    ).toEqual([2]);
  });

  it("marks a refused send as failed (tried again later) and goes on", async () => {
    mailer
      .mockResolvedValueOnce({
        ok: false,
        error: "Resend 429 rate_limit_exceeded: slow down",
      })
      .mockResolvedValueOnce({ ok: true, id: "re_2" });
    const { db, marks } = fakeDb(
      [
        { id: 3, to_email: PERSON },
        { id: 4, to_email: PERSON },
      ],
      due,
    );
    expect(await run(db)).toMatchObject({ sent: 1, failed: 1 });
    expect(marks()).toEqual([
      ["mark_outbox_failed", 3, "Resend 429 rate_limit_exceeded: slow down"],
      ["mark_outbox_sent", 4, "re_2"],
    ]);
  });

  it("marks a thrown error or unreadable facts as failed", async () => {
    mailer.mockRejectedValueOnce(new Error("socket hang up"));
    const one = fakeDb([{ id: 5, to_email: PERSON }], due);
    expect(await run(one.db)).toMatchObject({ failed: 1 });
    expect(one.marks()).toEqual([["mark_outbox_failed", 5, "socket hang up"]]);

    const two = fakeDb([{ id: 6, to_email: PERSON }], due, {
      factsError: true,
    });
    expect(await run(two.db)).toMatchObject({ failed: 1 });
    expect(two.marks()).toEqual([
      ["mark_outbox_failed", 6, "Facts not read: boom"],
    ]);
  });
});
