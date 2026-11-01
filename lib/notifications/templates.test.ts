import { describe, expect, test } from "vitest";
import {
  commentExcerpt,
  emailContent,
  escapeHtml,
  renderEmail,
  type EmailFacts,
} from "./templates";

const TZ = "Asia/Dubai";
const BASE = "https://laine-onboarding.vercel.app/";

const request: NonNullable<EmailFacts["request"]> = {
  id: "11111111-2222-3333-4444-555555555555",
  ticket: "UAM-2026-000124",
  type: "onboarding",
  firstName: "Anna",
  lastName: "Keller",
  effectiveDate: "2026-11-02",
  lastWorkingDay: null,
  waitingSince: "2026-10-30T06:12:00Z",
};

const base: EmailFacts = {
  kind: "waiting",
  request,
  itSigner: { name: "Raju Bholani", signedAt: "2026-10-30T06:12:00Z" },
  decision: null,
  pdfFileName: null,
  sla: null,
};

const offboarding: NonNullable<EmailFacts["request"]> = {
  ...request,
  type: "offboarding",
  firstName: "Marco",
  lastName: "Rossi",
  effectiveDate: null,
  lastWorkingDay: "2026-11-03",
};

const sla = {
  dueAt: "2026-11-03T14:00:00Z",
  timeline: "within_24h" as const,
  done: 5,
  total: 11,
  devicesPending: 1,
};

describe("email content (board Email notifications)", () => {
  test("waiting for approval", () => {
    const c = emailContent(base, TZ);
    expect(c.subject).toBe("Waiting for your confirmation: Anna Keller");
    expect(c.title).toBe("A request is waiting for you");
    expect(c.body).toBe(
      "Raju Bholani completed and signed the onboarding for Anna Keller. Please review and confirm — the first approver to confirm closes it.",
    );
    expect(c.facts).toEqual([
      "UAM-2026-000124 · Onboarding · effective 2 Nov 2026",
    ]);
    expect(c.cta).toBe("Review & confirm");
    expect(c.path).toBe(`/approvals/${request.id}`);
  });

  test("reminder counts whole days waited", () => {
    const c = emailContent(
      { ...base, kind: "reminder" },
      TZ,
      new Date("2026-11-02T08:00:00Z"),
    );
    expect(c.subject).toBe("Reminder — waiting 3 days: Anna Keller");
    expect(c.body).toContain("has waited 3 days");
    expect(c.facts).toEqual([
      "UAM-2026-000124 · signed by IT 30 Oct 2026, 10:12",
    ]);
  });

  test("returned: approver's first name, comment excerpt, flagged sections", () => {
    const c = emailContent(
      {
        ...base,
        kind: "returned",
        decision: {
          by: "Moises Larez",
          at: "2026-10-31T05:00:00Z",
          comment: "Figma should be Viewer,\nnot Editor.",
          flagged: [5, 2],
        },
      },
      TZ,
    );
    expect(c.subject).toBe("Returned by Moises: Anna Keller");
    expect(c.title).toBe("Moises returned a request");
    expect(c.facts).toEqual([
      "“Figma should be Viewer, not Editor.” · flagged: Employee details, Application access",
    ]);
    expect(c.path).toBe(`/requests/${request.id}`);
  });

  test("closed: time in the company timezone and the PDF name", () => {
    const c = emailContent(
      {
        ...base,
        kind: "closed",
        decision: {
          by: "Moises Larez",
          at: "2026-10-31T05:05:00Z",
          comment: null,
          flagged: [],
        },
        pdfFileName: "anna.keller-onboarding.pdf",
      },
      TZ,
    );
    expect(c.subject).toBe("Closed — PDF ready: Anna Keller");
    expect(c.body).toBe(
      "Moises confirmed the onboarding for Anna Keller. The PDF record is ready.",
    );
    expect(c.facts).toEqual([
      "UAM-2026-000124 · closed 31 Oct 2026, 09:05 · anna.keller-onboarding.pdf",
    ]);
    expect(c.path).toBe(`/records/${request.id}`);
  });

  test("SLA due soon", () => {
    const c = emailContent(
      { ...base, kind: "sla_due", request: offboarding, sla },
      TZ,
      new Date("2026-11-03T08:00:00Z"),
    );
    expect(c.subject).toBe("SLA due in 6h: Marco Rossi offboarding");
    expect(c.title).toBe("Access removal due in 6h");
    expect(c.body).toBe(
      "The offboarding for Marco Rossi must be completed by 3 Nov 2026, 18:00 (within 24h).",
    );
    expect(c.facts).toEqual(["5 of 11 removed · 1 device return pending"]);
  });

  test("SLA missed", () => {
    const c = emailContent(
      {
        ...base,
        kind: "sla_missed",
        request: offboarding,
        sla: { ...sla, done: 9, devicesPending: 0 },
      },
      TZ,
      new Date("2026-11-03T16:00:00Z"),
    );
    expect(c.subject).toBe("SLA missed: Marco Rossi offboarding");
    expect(c.facts).toEqual(["9 of 11 removed · overdue by 2h"]);
  });

  test("offboarding lists the last working day; a missing name shows the ticket", () => {
    const c = emailContent(
      { ...base, request: { ...offboarding, firstName: null, lastName: " " } },
      TZ,
    );
    expect(c.subject).toBe("Waiting for your confirmation: UAM-2026-000124");
    expect(c.facts).toEqual([
      "UAM-2026-000124 · Offboarding · last working day 3 Nov 2026",
    ]);
  });

  test("access change wording", () => {
    const c = emailContent(
      { ...base, request: { ...request, type: "access_modification" } },
      TZ,
    );
    expect(c.body).toContain("signed the access change for Anna Keller");
    expect(c.facts[0]).toContain("Access change · effective 2 Nov 2026");
  });

  test("test email needs no request", () => {
    const c = emailContent(
      { ...base, kind: "test", request: null, itSigner: null },
      TZ,
    );
    expect(c.subject).toBe("Test email from Laine onboarding rights");
    expect(c.path).toBe("/admin/notifications");
  });

  test("an email without its facts is refused", () => {
    expect(() =>
      emailContent({ ...base, kind: "returned", decision: null }, TZ),
    ).toThrow("returned email without the return");
  });
});

describe("rendered email", () => {
  test("escapes names, links the button to the site, has a text copy", () => {
    const email = renderEmail(
      {
        ...base,
        request: { ...request, firstName: "<b>Anna</b>", lastName: "O'Neil" },
      },
      { baseUrl: BASE, timeZone: TZ },
    );
    expect(email.subject).toBe(
      "Waiting for your confirmation: <b>Anna</b> O'Neil",
    );
    expect(email.html).not.toContain("<b>Anna</b>");
    expect(email.html).toContain("&lt;b&gt;Anna&lt;/b&gt; O&#39;Neil");
    expect(email.html).toContain(
      `href="https://laine-onboarding.vercel.app/approvals/${request.id}"`,
    );
    expect(email.html).toContain(
      'src="https://laine-onboarding.vercel.app/brand/laine-logo-white.png"',
    );
    expect(email.text).toContain(
      `Review & confirm: https://laine-onboarding.vercel.app/approvals/${request.id}`,
    );
    expect(email.text).toContain(
      "signed the onboarding for <b>Anna</b> O'Neil",
    );
  });

  test("never carries roles, access or signature details", () => {
    const { text } = renderEmail(base, { baseUrl: BASE, timeZone: TZ });
    expect(text).not.toMatch(/signature|permission|role/i);
  });
});

describe("helpers", () => {
  test("comment excerpt: one line, at most 120 characters", () => {
    expect(commentExcerpt("  a\n\nb  ")).toBe("a b");
    const long = commentExcerpt("word ".repeat(60));
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.endsWith("…")).toBe(true);
  });

  test("escapeHtml", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;",
    );
  });
});
