import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Leaver } from "@/lib/requests/leavers-shared";

vi.mock("server-only", () => ({}));
const leavers = vi.fn<() => Promise<Leaver[]>>();
vi.mock("@/lib/requests/leavers", () => ({
  listLeavers: () => leavers(),
}));

const { createOffboardingDraft } = await import("./create-offboarding-draft");

const ID = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
const ARJUN: Leaver = {
  id: "emp-1",
  name: "Arjun Mehta",
  email: "arjun.mehta@example.com",
  detail: "",
  items: 7,
  since: null,
  openTicket: null,
  openChange: null,
};
const complete = {
  person: "Arjun Mehta",
  lastWorkingDay: "2026-10-30",
  slaTimeline: "same_day",
  cutoffDate: "2026-10-30",
  cutoffTime: "18:00",
  handoverTo: "Rafiq Ahmed",
};

function fakeDb() {
  const rpc = vi.fn(async (name: string) =>
    name === "ai_start_request"
      ? { data: ID, error: null }
      : { data: 4, error: null },
  );
  return {
    rpc,
    db: {
      rpc,
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { ticket_id: "UAM-2026-000410" },
              error: null,
            }),
          }),
        }),
      }),
    },
  };
}

const ctx = (db: unknown) => ({
  userId: "u1",
  roles: ["admin" as const],
  timeZone: "Asia/Dubai",
  db: db as never,
});

beforeEach(() => leavers.mockResolvedValue([ARJUN]));

describe("createOffboardingDraft (F16d-1)", () => {
  test("a write that waits for Confirm — after the checklist and the person are clear", async () => {
    expect(createOffboardingDraft).toMatchObject({
      kind: "write",
      needsApproval: true,
      roles: ["admin", "requester"],
    });
    await expect(
      createOffboardingDraft.precheck!({ person: "Arjun Mehta" }, ctx({})),
    ).resolves.toContain("Ask about: last working day");
    await expect(
      createOffboardingDraft.precheck!(
        { ...complete, person: "Someone Else" },
        ctx({}),
      ),
    ).resolves.toContain("holds anything on record");
    await expect(
      createOffboardingDraft.precheck!(complete, ctx({})),
    ).resolves.toBeNull();
  });

  test("starts the offboarding for that person (removals pre-filled), then the timing as suggestions", async () => {
    const { db, rpc } = fakeDb();
    const out = await createOffboardingDraft.build(ctx(db)).execute!(
      complete as never,
      { toolCallId: "1", messages: [] } as never,
    );
    expect(out).toEqual({
      created: true,
      person: "Arjun Mehta",
      ticket: "UAM-2026-000410",
      link: `/requests/${ID}`,
      removals: 7,
      suggestions: 4,
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "ai_start_request", {
      p_type: "offboarding",
      p_employee_id: "emp-1",
    });
    expect(rpc.mock.calls[1][0]).toBe("suggest_request_values");
  });
});
