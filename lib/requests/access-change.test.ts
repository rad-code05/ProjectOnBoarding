import { describe, expect, test } from "vitest";
import {
  buildHeld,
  heldChoice,
  heldLabel,
  heldSummary,
  isSameAsToday,
  type HeldItem,
} from "./access-change";

const row = (
  over: Partial<Parameters<typeof buildHeld>[0]["inventory"][number]>,
) => ({
  id: "inv-x",
  kind: "application" as const,
  app_id: null,
  equipment_type_id: null,
  access_type_id: null,
  name: "X",
  category_name: null,
  permission: null,
  asset_tag: null,
  description: null,
  granted_at: "2026-10-01T08:00:00Z",
  granted_ticket: "UAM-2026-000101",
  ...over,
});

const held = buildHeld({
  inventory: [
    row({
      id: "inv-laptop",
      kind: "equipment",
      equipment_type_id: 1,
      name: "Laptop · macOS",
      asset_tag: "LN-0042",
    }),
    row({
      id: "inv-office",
      kind: "access",
      access_type_id: 1,
      name: "Office access",
      permission: "Badge",
    }),
    row({
      id: "inv-slack",
      app_id: 3,
      name: "Slack",
      category_name: "Core business",
      permission: "Regular Member",
    }),
    row({
      id: "inv-figma",
      app_id: 8,
      name: "Figma",
      category_name: "Core business",
      permission: "Dev",
    }),
    row({
      id: "inv-hex",
      app_id: 16,
      name: "Hexnode (MDM)",
      category_name: "Security",
      permission: "Device",
    }),
  ],
  apps: new Map([
    [
      3,
      {
        actions: ["Grant", "Modify", "Remove"],
        permissions: ["Regular Member", "Workspace Owner"],
        multiple: false,
      },
    ],
    [
      8,
      {
        actions: ["Grant", "Modify", "Remove"],
        permissions: ["View", "Dev", "Full"],
        multiple: false,
      },
    ],
    [
      16,
      {
        actions: ["Enroll", "Remove"],
        permissions: ["Device", "Admin"],
        multiple: false,
      },
    ],
  ]),
  accessTypes: new Map([
    [1, { actions: ["Grant", "Disable"], scopes: ["Badge", "Key"] }],
  ]),
  lines: [
    {
      id: "line-figma",
      inventory_id: "inv-figma",
      action: "Modify",
      value: "Full",
      notes: null,
    },
    {
      id: "line-laptop",
      inventory_id: "inv-laptop",
      action: "Return",
      value: null,
      notes: null,
    },
    // A new app (no link) is not a held row.
    {
      id: "line-new",
      inventory_id: null,
      action: "Grant",
      value: "Maintain",
      notes: null,
    },
  ],
});
const byName = (name: string) => held.find((h) => h.name === name) as HeldItem;

describe("buildHeld", () => {
  test("apps first (by category, name), then devices, then access", () => {
    expect(held.map((h) => h.name)).toEqual([
      "Figma",
      "Slack",
      "Hexnode (MDM)",
      "Laptop · macOS",
      "Office access",
    ]);
  });

  test("each row knows how it can change and how it is removed", () => {
    expect(byName("Slack")).toMatchObject({
      catalogId: 3,
      options: ["Regular Member", "Workspace Owner"],
      changeAction: "Modify",
      removeAction: "Remove",
      change: null,
    });
    // Hexnode has no Modify: a change is an Enroll with another option.
    expect(byName("Hexnode (MDM)").changeAction).toBe("Enroll");
    // Devices are kept or returned, never changed.
    expect(byName("Laptop · macOS")).toMatchObject({
      changeAction: null,
      removeAction: "Return",
    });
    // Office access: no Modify, but two scopes → a change re-grants; removal disables.
    expect(byName("Office access")).toMatchObject({
      changeAction: "Grant",
      removeAction: "Disable",
    });
  });

  test("this request's lines land on their rows", () => {
    expect(byName("Figma").change).toEqual({
      itemId: "line-figma",
      action: "Modify",
      value: "Full",
      notes: null,
    });
  });
});

describe("keep / change / remove", () => {
  test("no line = keep; a remove action = remove; anything else = change", () => {
    expect(heldChoice(byName("Slack"))).toBe("keep");
    expect(heldChoice(byName("Figma"))).toBe("change");
    expect(heldChoice(byName("Laptop · macOS"))).toBe("remove");
  });

  test("labels: today's value, was → now, or what happens", () => {
    expect(heldLabel(byName("Slack"))).toBe("Regular Member");
    expect(heldLabel(byName("Figma"))).toBe("Dev → Full");
    expect(heldLabel(byName("Laptop · macOS"))).toBe("To return");
    expect(heldLabel(byName("Office access"))).toBe("Badge");
  });

  test("summary counts", () => {
    expect(heldSummary(held)).toEqual({ keep: 3, change: 1, remove: 1 });
  });

  test("a change must be different from today (roles in any order)", () => {
    expect(isSameAsToday(byName("Slack"), "Regular Member")).toBe(true);
    expect(isSameAsToday(byName("Slack"), "Workspace Owner")).toBe(false);
    const cloud = { ...byName("Slack"), current: "Editor; Cloud Run Admin" };
    expect(isSameAsToday(cloud, "Cloud Run Admin; Editor")).toBe(true);
  });
});
