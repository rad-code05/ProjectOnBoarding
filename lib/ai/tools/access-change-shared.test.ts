import { describe, expect, test } from "vitest";
import type { HeldItem } from "@/lib/requests/access-change";
import type { Leaver } from "@/lib/requests/leavers-shared";
import {
  accessChangePerson,
  addedSuggestions,
  askAboutAccessChange,
  heldSuggestions,
  resolveAccessChange,
} from "./access-change-shared";
import type { FormOptions } from "./onboarding-shared";

const item = (over: Partial<HeldItem>): HeldItem => ({
  inventoryId: "inv-slack",
  kind: "application",
  catalogId: 12,
  name: "Slack",
  category: "Core business",
  current: "Regular Member",
  assetTag: null,
  description: null,
  grantedTicket: "UAM-2026-000300",
  grantedAt: "2026-10-01T08:00:00Z",
  options: ["Regular Member", "Workspace Owner"],
  multiple: false,
  changeAction: "Modify",
  removeAction: "Remove",
  change: null,
  ...over,
});

const held: HeldItem[] = [
  item({}),
  item({
    inventoryId: "inv-figma",
    catalogId: 14,
    name: "Figma",
    current: "Dev",
    options: ["Viewer", "Dev", "Editor"],
  }),
  item({
    inventoryId: "inv-lt1",
    kind: "equipment",
    catalogId: 2,
    name: "Laptop · macOS",
    current: null,
    assetTag: "LT-1008",
    options: [],
    changeAction: null,
    removeAction: "Return",
  }),
  item({
    inventoryId: "inv-lt2",
    kind: "equipment",
    catalogId: 2,
    name: "Laptop · macOS",
    current: null,
    assetTag: "LT-1009",
    options: [],
    changeAction: null,
    removeAction: "Return",
  }),
];

const options: FormOptions = {
  departments: [],
  offices: [],
  regions: [],
  cities: [],
  apps: [
    {
      id: 12,
      name: "Slack",
      actions: ["Grant", "Modify", "Remove"],
      permissions: ["Regular Member", "Workspace Owner"],
      multiple: false,
    },
    {
      id: 20,
      name: "HubSpot",
      actions: ["Grant", "Modify", "Remove"],
      permissions: ["User", "Admin"],
      multiple: false,
    },
  ],
  equipment: [],
  access: [],
};

describe("heldSuggestions: the access-change screen's own rules", () => {
  test("a new role, a removal and a returned laptop by its asset tag", () => {
    const r = heldSuggestions(
      [
        {
          item: "slack",
          action: "change",
          to: "workspace owner",
          reason: "you said so",
        },
        { item: "Figma", action: "remove" },
        { item: "LT-1009", action: "remove" },
      ],
      held,
    );
    expect(r.problems).toEqual([]);
    expect(r.suggestions).toEqual([
      {
        kind: "held",
        target: "held:inv-slack",
        value: { action: "Modify", value: "Workspace Owner" },
        reason: "you said so",
      },
      {
        kind: "held",
        target: "held:inv-figma",
        value: { action: "Remove", value: "Dev" },
      },
      {
        kind: "held",
        target: "held:inv-lt2",
        value: { action: "Return", value: null },
      },
    ]);
  });

  test("nothing guessed: two laptops, a role they already have, a device change, something they don't hold", () => {
    const r = heldSuggestions(
      [
        { item: "laptop", action: "remove" },
        { item: "Slack", action: "change", to: "Regular Member" },
        { item: "LT-1008", action: "change", to: "x" },
        { item: "Slack", action: "change", to: "God mode" },
        { item: "Zoom", action: "remove" },
      ],
      held,
    );
    expect(r.suggestions).toEqual([]);
    expect(r.problems).toEqual([
      'Several things match "laptop": Laptop · macOS (LT-1008), Laptop · macOS (LT-1009). Ask which one.',
      "Slack is already Regular Member.",
      "Laptop · macOS can't be changed, only returned.",
      "Slack: change to what? Options: Regular Member, Workspace Owner.",
      'They don\'t hold "Zoom". They hold: Slack, Figma, Laptop · macOS (LT-1008), Laptop · macOS (LT-1009).',
    ]);
  });
});

describe("something new, the person, the checklist", () => {
  test("new apps are granted; something they hold is a change, not new", () => {
    expect(
      addedSuggestions(
        { applications: [{ name: "HubSpot", permission: "Admin" }] },
        held,
        options,
      ).suggestions,
    ).toEqual([
      {
        kind: "access",
        target: "app:20",
        value: { action: "Grant", permission: "Admin" },
      },
    ]);
    expect(
      addedSuggestions(
        { applications: [{ name: "Slack", permission: "Workspace Owner" }] },
        held,
        options,
      ).problems[0],
    ).toContain("They already hold Slack");
  });

  test("leaving or already changing: asked about, never a second request", () => {
    const leaver = (over: Partial<Leaver>): Leaver => ({
      id: "e1",
      name: "Omar Haddad",
      email: "omar@example.com",
      detail: "",
      items: 4,
      since: null,
      openTicket: null,
      openChange: null,
      ...over,
    });
    expect(accessChangePerson([leaver({})], "Omar")).toMatchObject({
      leaver: { id: "e1" },
    });
    expect(
      accessChangePerson([leaver({ openChange: "UAM-2026-000420" })], "Omar"),
    ).toMatchObject({
      problem: expect.stringContaining("Offer to add to that one"),
    });
    expect(
      accessChangePerson([leaver({ openTicket: "UAM-2026-000390" })], "Omar"),
    ).toMatchObject({ problem: expect.stringContaining("Leaving") });
  });

  test("checklist: at least one change and the effective date", () => {
    expect(askAboutAccessChange({ person: "Omar" })).toContain(
      "Ask about: what changes",
    );
    expect(
      askAboutAccessChange({
        person: "Omar",
        changes: [{ item: "Figma", action: "remove" }],
      }),
    ).toContain("effective date");
    const leaver: Leaver = {
      id: "e1",
      name: "Omar Haddad",
      email: "omar@example.com",
      detail: "",
      items: 4,
      since: null,
      openTicket: null,
      openChange: null,
    };
    const r = resolveAccessChange(
      {
        person: "Omar",
        changes: [{ item: "Figma", action: "remove" }],
        effectiveDate: "2026-11-01",
      },
      leaver,
      held,
      options,
    );
    expect(r.ok && r.suggestions.map((s) => s.target)).toEqual([
      "held:inv-figma",
      "effective_date",
    ]);
  });
});
