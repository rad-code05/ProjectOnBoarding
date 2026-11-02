import { describe, expect, it } from "vitest";
import {
  recentEmails,
  senderStatus,
  switchWords,
  type OutboxRow,
} from "./notifications-shared";

const row = (over: Partial<OutboxRow>): OutboxRow => ({
  id: 1,
  kind: "waiting",
  requestId: "r1",
  status: "sent",
  attempts: 1,
  lastError: null,
  createdAt: "2026-11-02T10:00:00Z",
  sentAt: "2026-11-02T10:01:00Z",
  to: "Moises Larez",
  person: { firstName: "Anna", lastName: "Keller" },
  ...over,
});

describe("senderStatus", () => {
  it("says what this site does with emails", () => {
    expect(
      senderStatus({ mode: "off", reason: "No Resend key — emails wait." }),
    ).toMatchObject({ headline: "Not connected yet", connected: false });
    expect(
      senderStatus({ mode: "off", reason: "Preview sites never send emails." })
        .headline,
    ).toBe("Preview site");
    expect(senderStatus({ mode: "test_accounts" }).line).toBe(
      "Only the test accounts get emails",
    );
    expect(senderStatus({ mode: "everyone" })).toMatchObject({
      headline: "Connected",
      connected: true,
    });
  });
});

describe("switchWords", () => {
  it("uses the reminder days and SLA hours from the settings", () => {
    const s = { reminderAfterDays: 3, slaWarnHours: 1 };
    expect(switchWords("reminder", s).when).toBe(
      "Daily after 3 days of waiting.",
    );
    expect(switchWords("sla_due", s).when).toBe(
      "To IT, 1 hour before an offboarding deadline.",
    );
  });
});

describe("recentEmails", () => {
  it("joins one email to several approvers into one line", () => {
    const lines = recentEmails([
      row({ id: 1 }),
      row({ id: 2, to: "Celine Example" }),
    ]);
    expect(lines).toEqual([
      expect.objectContaining({
        subject: "Waiting for your confirmation: Anna Keller",
        to: "Moises Larez, Celine Example",
        status: "Sent",
      }),
    ]);
  });

  it("keeps a different status on its own line, newest first, with the reason", () => {
    const lines = recentEmails([
      row({ id: 1 }),
      row({
        id: 2,
        to: "Celine Example",
        status: "failed",
        lastError: "Resend 422 validation_error: bad address",
        sentAt: null,
      }),
      row({
        id: 3,
        kind: "test",
        requestId: null,
        person: null,
        to: "Raju Bholani",
        status: "pending",
        attempts: 1,
        lastError: "Resend 429 rate_limit_exceeded",
        createdAt: "2026-11-02T11:00:00Z",
        sentAt: null,
      }),
    ]);
    expect(lines.map((l) => [l.subject, l.status, l.note])).toEqual([
      ["Test email", "Waiting", "Tried 1 of 3: Resend 429 rate_limit_exceeded"],
      ["Waiting for your confirmation: Anna Keller", "Sent", null],
      [
        "Waiting for your confirmation: Anna Keller",
        "Failed",
        "Resend 422 validation_error: bad address",
      ],
    ]);
  });

  it("shows skipped emails with the database's reason", () => {
    const [line] = recentEmails([
      row({
        kind: "sla_missed",
        status: "skipped",
        lastError: "the removals are finished",
        sentAt: null,
      }),
    ]);
    expect(line).toMatchObject({
      subject: "SLA missed: Anna Keller offboarding",
      status: "Skipped",
      note: "the removals are finished",
    });
  });
});
