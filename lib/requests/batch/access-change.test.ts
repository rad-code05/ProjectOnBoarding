import { describe, expect, test } from "vitest";
import type { FormOptions } from "@/lib/ai/tools/onboarding-shared";
import type { HeldItem } from "@/lib/requests/access-change";
import type { Leaver } from "@/lib/requests/leavers-shared";
import {
  checkAccessChangeBatch,
  checkAccessChangeRow,
  readAdd,
  type AccessChangeContext,
} from "./access-change";
import { listItems } from "./onboarding";

const leaver = (over: Partial<Leaver>): Leaver => ({
  id: "e1",
  name: "Arjun Mehta",
  email: "arjun.mehta@example.com",
  detail: "Sales · India",
  items: 3,
  since: "UAM-2026-000100",
  openTicket: null,
  openChange: null,
  ...over,
});

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
  options: ["Regular Member", "Workspace Admin"],
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
    inventoryId: "inv-gcp",
    catalogId: 30,
    name: "Google Cloud",
    current: "Viewer",
    options: ["Viewer", "Editor", "Owner"],
    multiple: true,
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
      permissions: ["Regular Member", "Workspace Admin"],
      multiple: false,
    },
    {
      id: 40,
      name: "Notion",
      actions: ["Grant", "Modify", "Remove"],
      permissions: ["Member", "Admin"],
      multiple: false,
    },
  ],
  equipment: [{ id: 3, name: "Monitor", actions: ["Issue", "Return"] }],
  access: [
    {
      id: 7,
      name: "Office access",
      actions: ["Grant", "Remove"],
      scopes: ["Badge", "Badge + PIN"],
    },
  ],
};

const ctx: AccessChangeContext = {
  leavers: [
    leaver({}),
    leaver({ id: "e2", name: "Sara Khan", email: "sara.khan@example.com" }),
    leaver({ id: "e3", name: "Sara Lopez", email: "sara.lopez@example.com" }),
    leaver({
      id: "e4",
      name: "Omar Haddad",
      email: "omar.haddad@example.com",
      openChange: "UAM-2026-000391",
    }),
  ],
  held: new Map([["e1", held]]),
  options,
  today: "2026-10-30",
};

const fields = (problems: { field: string }[]) => problems.map((p) => p.field);

describe("listItems keeps a comma inside brackets", () => {
  test("several roles in one item", () => {
    expect(listItems("Google Cloud (Viewer, Editor), Slack")).toEqual([
      "Google Cloud (Viewer, Editor)",
      "Slack",
    ]);
    expect(listItems("Slack\nFigma, Notion")).toEqual([
      "Slack",
      "Figma",
      "Notion",
    ]);
  });
});

describe("readAdd: each item an app, an equipment type or an access type", () => {
  test("sorted by the catalog; unknown names kept for a problem", () => {
    const r = readAdd(
      "Notion (Member), Monitor, Office access (Badge), Teleporter",
      options,
    );
    expect(r.add.applications).toEqual([
      { name: "Notion", permission: "Member" },
    ]);
    expect(r.add.equipment).toEqual([{ type: "Monitor" }]);
    expect(r.add.access).toEqual([{ type: "Office access", scope: "Badge" }]);
    expect(r.unknown).toEqual(["Teleporter"]);
  });
});

describe("checkAccessChangeRow", () => {
  test("a change, a removal, a returned laptop and something new", () => {
    const r = checkAccessChangeRow(
      {
        person: "arjun.mehta@example.com",
        effectiveDate: "01/12/2026",
        change: "Slack (Workspace Admin), Google Cloud (Viewer, Editor)",
        remove: "Figma, LT-1008",
        add: "Notion (Member)",
      },
      ctx,
    );
    expect(r.problems).toEqual([]);
    expect(r.employeeId).toBe("e1");
    expect(r.writes).toEqual([
      { kind: "field", target: "effective_date", value: "2026-12-01" },
      {
        kind: "held",
        target: "held:inv-slack",
        value: { action: "Modify", value: "Workspace Admin" },
      },
      {
        kind: "held",
        target: "held:inv-gcp",
        value: { action: "Modify", value: "Viewer; Editor" },
      },
      {
        kind: "held",
        target: "held:inv-figma",
        value: { action: "Remove", value: "Dev" },
      },
      {
        kind: "held",
        target: "held:inv-lt1",
        value: { action: "Return", value: null },
      },
      {
        kind: "access",
        target: "app:40",
        value: expect.objectContaining({ permission: "Member" }),
      },
    ]);
  });

  test("each problem names its cell", () => {
    const r = checkAccessChangeRow(
      {
        person: "Arjun Mehta",
        effectiveDate: "01/10/2026",
        change: "Slack, Zoom (Admin)",
        remove: "Slack",
        add: "Slack (Regular Member), Teleporter",
      },
      ctx,
    );
    expect(fields(r.problems).sort()).toEqual(
      ["add", "add", "change", "change", "effectiveDate"].sort(),
    );
    expect(r.problems.find((p) => p.field === "effectiveDate")?.message).toBe(
      "In the past — dates are never backdated",
    );
    expect(r.problems.map((p) => p.message).join(" ")).toContain(
      "change to what?",
    );
    expect(r.problems.map((p) => p.message).join(" ")).toContain(
      'They don\'t hold "Zoom"',
    );
  });

  test("changed and removed at once is flagged", () => {
    const r = checkAccessChangeRow(
      {
        person: "Arjun Mehta",
        effectiveDate: "2026-12-01",
        change: "Figma (Editor)",
        remove: "Figma",
      },
      ctx,
    );
    expect(r.problems).toEqual([
      {
        field: "remove",
        message: "Figma is both changed and removed — pick one",
      },
    ]);
  });

  test("the person: unknown, several, already changing; and nothing to change", () => {
    const unknown = checkAccessChangeRow(
      { person: "Nobody Here", effectiveDate: "2026-12-01", remove: "Slack" },
      ctx,
    );
    expect(unknown.employeeId).toBeNull();
    expect(unknown.problems[0].message).toContain("holds anything in the app");
    const several = checkAccessChangeRow(
      { person: "Sara", effectiveDate: "2026-12-01", remove: "Slack" },
      ctx,
    );
    expect(several.problems[0].message).toContain("2 people match");
    const open = checkAccessChangeRow(
      { person: "Omar Haddad", effectiveDate: "2026-12-01", remove: "Slack" },
      ctx,
    );
    expect(open.problems[0].message).toBe(
      "Access change already open · UAM-2026-000391",
    );
    const nothing = checkAccessChangeRow(
      { person: "Arjun Mehta", effectiveDate: "2026-12-01" },
      ctx,
    );
    expect(nothing.problems).toEqual([
      {
        field: "change",
        message: "Nothing changes — fill in Change, Remove or Add",
      },
    ]);
  });
});

describe("checkAccessChangeBatch", () => {
  test("the same person twice: the later row is flagged", () => {
    const out = checkAccessChangeBatch(
      [
        {
          position: 2,
          values: {
            person: "arjun.mehta@example.com",
            effectiveDate: "2026-12-01",
            remove: "Figma",
          },
        },
        {
          position: 1,
          values: {
            person: "Arjun Mehta",
            effectiveDate: "2026-12-01",
            change: "Slack (Workspace Admin)",
          },
        },
      ],
      ctx,
    );
    expect(out.get(1)?.problems).toEqual([]);
    expect(out.get(2)?.problems).toEqual([
      { field: "person", message: "The same person as row 1" },
    ]);
  });
});
