// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { parseTicket, requestLink, sectionNames } from "./request-shared";

vi.mock("server-only", () => ({}));

const { listRequests } = await import("./list-requests");
const { getRequest } = await import("./get-request");

const ID = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
const draft = {
  id: ID,
  ticket_id: "UAM-2026-000374",
  ticket_year: 2026,
  type: "onboarding",
  state: "draft",
  first_name: null,
  last_name: null,
  work_email: null,
  job_title: null,
  country: null,
  effective_date: null,
  sla_due_at: null,
  created_at: "2026-10-21T08:00:00Z",
  updated_at: "2026-10-21T08:00:00Z",
  closed_at: null,
  office: null,
  department: null,
  assignee: null,
};

/** The person's own client: filters are recorded, the table comes back. */
function fakeDb(tables: Record<string, unknown[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = (table: string) => {
    const rows = tables[table] ?? [];
    const result = { data: rows, error: null, count: rows.length };
    const builder: Record<string, unknown> = {
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    };
    for (const m of ["select", "eq", "in", "or", "order", "limit", "gte"]) {
      builder[m] = (...args: unknown[]) => {
        calls.push({ table, method: m, args });
        return builder;
      };
    }
    return builder;
  };
  const rpc = vi.fn(async () => ({
    data: {
      missing_fields: ["First name", "Office"],
      checklist_complete: false,
    },
    error: null,
  }));
  return { db: { from, rpc }, calls, rpc };
}

const run = async (
  t: { build: (c: never) => unknown },
  input: object,
  db: unknown,
  roles = ["admin"],
) => {
  const ctx = { userId: "user_raju", roles, timeZone: "Asia/Dubai", db };
  const built = t.build(ctx as never) as {
    execute: (i: object, o: object) => Promise<Record<string, unknown>>;
  };
  return built.execute(input, { toolCallId: "1", messages: [] });
};

describe("tickets as people type them", () => {
  test("full, short, or just the number", () => {
    expect(parseTicket("UAM-2026-000375")).toEqual({ year: 2026, number: 375 });
    expect(parseTicket("uam 2026 375")).toEqual({ year: 2026, number: 375 });
    expect(parseTicket("375")).toEqual({ year: null, number: 375 });
    expect(parseTicket("Rose")).toBeNull();
  });

  test("closed requests open as records; flagged sections by name", () => {
    expect(requestLink(ID, "closed")).toBe(`/records/${ID}`);
    expect(requestLink(ID, "draft")).toBe(`/requests/${ID}`);
    expect(sectionNames([9, 5])).toEqual([
      "9 · IT execution confirmation",
      "5 · Application access",
    ]);
  });
});

describe("listRequests", () => {
  test("'what is missing on my drafts' — one call, mine + open, with what is missing", async () => {
    const { db, calls, rpc } = fakeDb({ requests: [draft] });
    const out = await run(listRequests, { mine: true, status: "open" }, db);
    expect(calls).toContainEqual({
      table: "requests",
      method: "eq",
      args: ["created_by", "user_raju"],
    });
    expect(rpc).toHaveBeenCalledWith("signing_checks", { p_request_id: ID });
    expect(out).toMatchObject({
      requests: [
        {
          ticket: "UAM-2026-000374",
          status: "Draft",
          person: "No name yet",
          stillMissing: ["First name", "Office"],
        },
      ],
    });
  });

  test("'who was onboarded today' — one call: closed, since midnight company time", async () => {
    const { db, calls } = fakeDb({
      requests: [
        { ...draft, state: "closed", closed_at: "2026-10-24T06:00:00Z" },
      ],
    });
    const out = await run(
      listRequests,
      { type: "onboarding", closedSince: "today" },
      db,
    );
    expect(calls).toContainEqual({
      table: "requests",
      method: "eq",
      args: ["state", "closed"],
    });
    const gte = calls.find((c) => c.method === "gte");
    expect(gte?.args[0]).toBe("closed_at");
    expect(String(gte?.args[1])).toMatch(/T20:00:00\.000Z$/);
    expect(out).toMatchObject({ requests: [{ closed: "24 Oct 2026" }] });
  });

  test("not IT: no Review & sign checks", async () => {
    const { db, rpc } = fakeDb({ requests: [draft] });
    const out = await run(listRequests, {}, db, ["auditor"]);
    expect(rpc).not.toHaveBeenCalled();
    expect(
      (out.requests as Record<string, unknown>[])[0].stillMissing,
    ).toBeUndefined();
  });
});

describe("getRequest", () => {
  test("one request with what is missing and where it opens", async () => {
    const { db } = fakeDb({ requests: [draft] });
    const out = await run(getRequest, { ticket: "374" }, db);
    expect(out).toMatchObject({
      ticket: "UAM-2026-000374",
      status: "Draft",
      stillMissing: ["First name", "Office"],
      link: `/requests/${ID}`,
    });
  });

  test("a closed request: the PDF link, for the people Records is for", async () => {
    const closed = {
      ...draft,
      state: "closed",
      closed_at: "2026-10-21T10:00:00Z",
    };
    const admin = await run(
      getRequest,
      { ticket: "374" },
      fakeDb({ requests: [closed] }).db,
    );
    expect(admin).toMatchObject({
      status: "Closed",
      link: `/records/${ID}`,
      pdfLink: `/records/${ID}/pdf`,
      // The PDF route's own name — never a guess.
      pdfFileName: "request-onboarding.pdf",
    });
    expect(admin.stillMissing).toBeUndefined();
    const it = await run(
      getRequest,
      { ticket: "374" },
      fakeDb({ requests: [closed] }).db,
      ["requester", "it_operator"],
    );
    expect(it.pdfLink).toBeUndefined();
  });

  test("the same number in two years: ask", async () => {
    const { db } = fakeDb({
      requests: [draft, { ...draft, ticket_id: "UAM-2025-000374" }],
    });
    expect(await run(getRequest, { ticket: "374" }, db)).toMatchObject({
      error: "Several years have this ticket number. Ask which one is meant.",
      matches: ["UAM-2026-000374", "UAM-2025-000374"],
    });
  });

  test("not a ticket, or not visible: ask", async () => {
    const { db } = fakeDb({ requests: [] });
    expect(await run(getRequest, { ticket: "Rose" }, db)).toMatchObject({
      error: expect.stringContaining("not a ticket"),
    });
    expect(await run(getRequest, { ticket: "999" }, db)).toMatchObject({
      error: expect.stringContaining("No request with that ticket"),
    });
  });
});
