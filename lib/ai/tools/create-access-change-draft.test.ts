import { beforeEach, describe, expect, test, vi } from "vitest";
import type { HeldItem } from "@/lib/requests/access-change";
import type { Leaver } from "@/lib/requests/leavers-shared";
import type { FormOptions } from "./onboarding-shared";

vi.mock("server-only", () => ({}));
const leavers = vi.fn<() => Promise<Leaver[]>>();
const held = vi.fn<() => Promise<{ held: HeldItem[]; previous: null }>>();
const options = vi.fn<() => Promise<FormOptions>>();
vi.mock("@/lib/requests/leavers", () => ({ listLeavers: () => leavers() }));
vi.mock("@/lib/requests/access-change-load", () => ({
  loadAccessChange: () => held(),
}));
vi.mock("./onboarding-load", () => ({ loadFormOptions: () => options() }));

const { createAccessChangeDraft } =
  await import("./create-access-change-draft");

const ID = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
const OMAR: Leaver = {
  id: "emp-9",
  name: "Omar Haddad",
  email: "omar@example.com",
  detail: "",
  items: 2,
  since: null,
  openTicket: null,
  openChange: null,
};
const FIGMA: HeldItem = {
  inventoryId: "inv-figma",
  kind: "application",
  catalogId: 14,
  name: "Figma",
  category: null,
  current: "Dev",
  assetTag: null,
  description: null,
  grantedTicket: null,
  grantedAt: "2026-10-01T08:00:00Z",
  options: ["Viewer", "Dev"],
  multiple: false,
  changeAction: "Modify",
  removeAction: "Remove",
  change: null,
};
const input = {
  person: "Omar Haddad",
  changes: [{ item: "Figma", action: "remove" }],
  effectiveDate: "2026-11-01",
};
const ctx = (db: unknown) => ({
  userId: "u1",
  roles: ["admin" as const],
  timeZone: "Asia/Dubai",
  db: db as never,
});

beforeEach(() => {
  leavers.mockResolvedValue([OMAR]);
  held.mockResolvedValue({ held: [FIGMA], previous: null });
  options.mockResolvedValue({
    departments: [],
    offices: [],
    regions: [],
    cities: [],
    apps: [],
    equipment: [],
    access: [],
  });
});

describe("createAccessChangeDraft (F16d-2)", () => {
  test("Confirm only after what changes and when are clear, and the item is held", async () => {
    expect(createAccessChangeDraft).toMatchObject({
      kind: "write",
      needsApproval: true,
      roles: ["admin", "requester"],
    });
    await expect(
      createAccessChangeDraft.precheck!({ person: "Omar" }, ctx({})),
    ).resolves.toContain("Ask about: what changes");
    await expect(
      createAccessChangeDraft.precheck!(
        { ...input, changes: [{ item: "Zoom", action: "remove" }] },
        ctx({}),
      ),
    ).resolves.toContain('They don\'t hold "Zoom"');
    await expect(
      createAccessChangeDraft.precheck!(input, ctx({})),
    ).resolves.toBeNull();
  });

  test("starts the access change for that person, then each change as a suggestion", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "ai_start_request"
        ? { data: ID, error: null }
        : { data: 2, error: null },
    );
    const db = {
      rpc,
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { ticket_id: "UAM-2026-000420" },
              error: null,
            }),
          }),
        }),
      }),
    };
    const out = await createAccessChangeDraft.build(ctx(db)).execute!(
      input as never,
      { toolCallId: "1", messages: [] } as never,
    );
    expect(out).toEqual({
      created: true,
      person: "Omar Haddad",
      ticket: "UAM-2026-000420",
      link: `/requests/${ID}`,
      suggestions: 2,
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "ai_start_request", {
      p_type: "access_modification",
      p_employee_id: "emp-9",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "suggest_request_values", {
      p_request_id: ID,
      p_suggestions: [
        {
          kind: "held",
          target: "held:inv-figma",
          value: { action: "Remove", value: "Dev" },
        },
        { kind: "field", target: "effective_date", value: "2026-11-01" },
      ],
    });
  });
});
