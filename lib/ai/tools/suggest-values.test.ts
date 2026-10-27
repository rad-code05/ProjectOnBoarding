import { beforeEach, describe, expect, test, vi } from "vitest";
import type { FormOptions } from "./onboarding-shared";

vi.mock("server-only", () => ({}));
const options = vi.fn<() => Promise<FormOptions>>();
vi.mock("./onboarding-load", () => ({
  loadFormOptions: () => options(),
}));

const { suggestValues } = await import("./suggest-values");

const ID = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
const OPTIONS: FormOptions = {
  departments: [],
  offices: [],
  regions: [],
  cities: [],
  apps: [
    {
      id: 7,
      name: "GitHub",
      actions: ["Grant"],
      permissions: ["Member", "Owner"],
      multiple: false,
    },
  ],
  equipment: [],
  access: [],
};

type Row = { id: string; ticket_id: string; type: string; state: string };

/** requests by ticket (RLS) + suggest_request_values. */
function fakeDb(rows: Row[]) {
  const rpc = vi.fn(async () => ({ data: 2, error: null }));
  const query = {
    eq: () => query,
    order: () => query,
    then: (resolve: (r: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  };
  return {
    db: { rpc, from: () => ({ select: () => query }) },
    rpc,
  };
}

const call = (input: unknown, db: unknown) =>
  suggestValues.build({
    userId: "u1",
    roles: ["admin"],
    timeZone: "Asia/Dubai",
    db: db as never,
  }).execute!(input as never, { toolCallId: "1", messages: [] } as never);

const draft: Row = {
  id: ID,
  ticket_id: "UAM-2026-000404",
  type: "onboarding",
  state: "draft",
};

beforeEach(() => options.mockResolvedValue(OPTIONS));

describe("suggestValues (F16c-2)", () => {
  test("a suggestion, not a write: no Confirm, admins and requesters", () => {
    expect(suggestValues).toMatchObject({
      kind: "propose",
      needsApproval: false,
      roles: ["admin", "requester"],
    });
  });

  test("adds only the values given to the draft with that ticket", async () => {
    const { db, rpc } = fakeDb([draft]);
    const out = await call(
      {
        ticket: "UAM-2026-000404",
        values: {
          workEmail: "Test2@test.com",
          applications: [{ name: "github", permission: "member" }],
        },
      },
      db,
    );
    expect(out).toEqual({
      added: 2,
      ticket: "UAM-2026-000404",
      link: `/requests/${ID}`,
    });
    expect(rpc).toHaveBeenCalledWith("suggest_request_values", {
      p_request_id: ID,
      p_suggestions: [
        { kind: "field", target: "work_email", value: "test2@test.com" },
        {
          kind: "access",
          target: "app:7",
          value: { action: "Grant", permission: "Member" },
        },
      ],
    });
  });

  test("refuses closed requests, other types, unknown tickets and names", async () => {
    const closed = fakeDb([{ ...draft, state: "closed" }]);
    await expect(
      call({ ticket: "404", values: { jobTitle: "x" } }, closed.db),
    ).resolves.toMatchObject({
      added: 0,
      error: "This request can't be changed any more.",
    });
    const leaving = fakeDb([{ ...draft, type: "offboarding" }]);
    await expect(
      call({ ticket: "404", values: { jobTitle: "x" } }, leaving.db),
    ).resolves.toMatchObject({ added: 0 });
    const none = fakeDb([]);
    await expect(
      call({ ticket: "404", values: { jobTitle: "x" } }, none.db),
    ).resolves.toMatchObject({ added: 0 });
    const ok = fakeDb([draft]);
    const out = await call(
      { ticket: "404", values: { applications: [{ name: "Notion" }] } },
      ok.db,
    );
    expect(out).toMatchObject({ added: 0 });
    expect(JSON.stringify(out)).toContain("isn't in the catalog");
    expect(ok.rpc).not.toHaveBeenCalled();
  });
});
