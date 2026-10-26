import { beforeEach, describe, expect, test, vi } from "vitest";
import type { FormOptions } from "./onboarding-shared";

vi.mock("server-only", () => ({}));
const options = vi.fn<() => Promise<FormOptions>>();
vi.mock("./onboarding-load", () => ({
  loadFormOptions: () => options(),
}));

const { createOnboardingDraft } = await import("./create-onboarding-draft");

const ID = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
const OPTIONS: FormOptions = {
  departments: [{ id: 1, name: "Engineering" }],
  offices: [{ id: 1, name: "Dubai", country: "AE", usesRegions: false }],
  regions: [],
  cities: [],
  apps: [
    {
      id: 12,
      name: "Slack",
      actions: ["Grant"],
      permissions: ["Regular Member"],
      multiple: false,
    },
  ],
  equipment: [],
  access: [],
};

/** The two database functions and the ticket, with the person's own session. */
function fakeDb(fail: "start" | "suggest" | null = null) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "ai_start_request")
      return fail === "start"
        ? { data: null, error: { message: "denied" } }
        : { data: ID, error: null };
    return fail === "suggest"
      ? { data: null, error: { message: "nope" } }
      : { data: 4, error: null };
  });
  const db = {
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { ticket_id: "UAM-2026-000027" },
            error: null,
          }),
        }),
      }),
    }),
  };
  return { db, rpc };
}

async function call(input: unknown, db: unknown) {
  const tool = createOnboardingDraft.build({
    userId: "u1",
    roles: ["admin"],
    timeZone: "Asia/Dubai",
    db: db as never,
  });
  return tool.execute!(
    input as never,
    {
      toolCallId: "1",
      messages: [],
    } as never,
  );
}

beforeEach(() => options.mockResolvedValue(OPTIONS));

describe("createOnboardingDraft (F16c)", () => {
  test("a write that waits for the person's Confirm, admins and requesters only", () => {
    expect(createOnboardingDraft).toMatchObject({
      kind: "write",
      needsApproval: true,
      roles: ["admin", "requester"],
    });
  });

  test("checked first, then the draft, then its suggestions", async () => {
    const { db, rpc } = fakeDb();
    const out = await call(
      {
        firstName: "Meera",
        lastName: "Nair",
        office: "Dubai",
        applications: [{ name: "Slack" }],
      },
      db,
    );
    expect(out).toEqual({
      created: true,
      ticket: "UAM-2026-000027",
      link: `/requests/${ID}`,
      suggestions: 4,
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "ai_start_request", {
      p_type: "onboarding",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "suggest_request_values", {
      p_request_id: ID,
      p_suggestions: [
        { kind: "field", target: "first_name", value: "Meera" },
        { kind: "field", target: "last_name", value: "Nair" },
        { kind: "field", target: "office_id", value: 1 },
        { kind: "field", target: "country", value: "AE" },
        {
          kind: "access",
          target: "app:12",
          value: { action: "Grant", permission: "Regular Member" },
        },
      ],
    });
  });

  test("problems: nothing is created", async () => {
    const { db, rpc } = fakeDb();
    const out = await call(
      { firstName: "Meera", lastName: "Nair", office: "Mumbai" },
      db,
    );
    expect(out).toMatchObject({ created: false });
    expect(JSON.stringify(out)).toContain('There is no office \\"Mumbai\\"');
    expect(rpc).not.toHaveBeenCalled();
  });

  test("refused by the database: says so", async () => {
    const { db } = fakeDb("start");
    await expect(
      call({ firstName: "Meera", lastName: "Nair" }, db),
    ).resolves.toMatchObject({ created: false });
    const second = fakeDb("suggest");
    await expect(
      call({ firstName: "Meera", lastName: "Nair" }, second.db),
    ).resolves.toMatchObject({ created: true, suggestions: 0 });
  });
});
