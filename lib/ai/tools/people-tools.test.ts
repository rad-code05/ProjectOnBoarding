// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { whoHasAccess } = await import("./who-has-access");
const { getPersonAccess } = await import("./get-person-access");
const { getCatalog } = await import("./get-catalog");

const person = (first: string, last: string, email: string) => ({
  first_name: first,
  last_name: last,
  work_email: email,
});

/** What the person's own client returns, table by table (RLS already applied). */
const TABLES: Record<string, unknown[]> = {
  employees: [
    { id: "a", ...person("manuel", "amigo test", "amigo@gmail.com") },
    { id: "b", ...person("hello", "test user", "hello@laine.ai") },
  ],
  employee_access_inventory: [
    {
      kind: "application",
      name: "Cursor",
      permission: "Admin",
      granted_at: "2026-10-14T08:00:00Z",
      employee_id: "a",
      employee: person("manuel", "amigo test", "amigo@gmail.com"),
    },
    {
      kind: "application",
      name: "Monday.com",
      permission: "Viewer; Admin",
      granted_at: "2026-10-13T08:00:00Z",
      employee_id: "b",
      employee: person("hello", "test user", "hello@laine.ai"),
    },
    {
      kind: "application",
      name: "Slack",
      permission: "Member",
      granted_at: "2026-10-12T08:00:00Z",
      employee_id: "a",
      employee: person("manuel", "amigo test", "amigo@gmail.com"),
    },
  ],
  requests: [
    {
      employee_id: "b",
      ticket_id: "UAM-2026-000318",
      type: "offboarding",
      state: "pending_confirmation",
    },
  ],
  catalog_categories: [{ id: 1, name: "Core business" }],
  catalog_apps: [
    {
      name: "Cursor",
      category_id: 1,
      permissions: ["Member", "Admin"],
      multi_permission: false,
    },
    {
      name: "Figma",
      category_id: 1,
      permissions: ["Viewer", "Editor", "Admin"],
      multi_permission: false,
    },
  ],
  equipment_types: [{ name: "Laptop" }],
  physical_access_types: [{ name: "Office door", scopes: ["Dubai"] }],
};

/** A stand-in for the Supabase client: every filter is accepted, the table comes back. */
function fakeDb(tables = TABLES) {
  const from = vi.fn((table: string) => {
    const result = { data: tables[table] ?? [], error: null };
    const builder: Record<string, unknown> = {
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
    };
    for (const m of ["select", "is", "in", "eq", "neq", "not", "order"]) {
      builder[m] = () => builder;
    }
    return builder;
  });
  return { from };
}

const run = async (
  t: { build: (c: never) => unknown },
  input: object,
  db = fakeDb(),
) => {
  const ctx = { userId: "u", roles: ["admin"], timeZone: "Asia/Dubai", db };
  const built = t.build(ctx as never) as {
    execute: (i: object, o: object) => Promise<Record<string, unknown>>;
  };
  return built.execute(input, { toolCallId: "1", messages: [] });
};

describe("whoHasAccess", () => {
  test("'who has Admin in any application' — one call, every application", async () => {
    const db = fakeDb();
    const out = await run(whoHasAccess, { permission: "admin" }, db);
    expect(out).toMatchObject({
      people: 2,
      items: [
        {
          item: "Cursor",
          holders: [
            {
              person: "manuel amigo test",
              leaving: false,
              since: "14 Oct 2026",
            },
          ],
        },
        {
          item: "Monday.com",
          holders: [{ person: "hello test user", leaving: true }],
        },
      ],
    });
    // The inventory is read once — not once per application.
    expect(
      db.from.mock.calls.filter(([t]) => t === "employee_access_inventory"),
    ).toHaveLength(1);
  });

  test("an item nobody holds vs an item that doesn't exist", async () => {
    expect(await run(whoHasAccess, { item: "Figma" })).toMatchObject({
      people: 0,
      items: [],
    });
    expect(await run(whoHasAccess, { item: "Riyadh portal" })).toMatchObject({
      error: expect.stringContaining("Ask which one is meant"),
    });
  });
});

describe("getPersonAccess", () => {
  test("one person's items, with their open offboarding", async () => {
    const out = await run(getPersonAccess, { person: "hello test" });
    expect(out).toMatchObject({
      person: "hello test user",
      leaving: true,
      openRequests: ["UAM-2026-000318: Offboarding, Awaiting confirmation"],
    });
  });

  test("several matches: ask, never pick", async () => {
    const out = await run(getPersonAccess, { person: "test" });
    expect(out).toMatchObject({
      error: "Several people match. Ask which one is meant.",
      matches: [
        "hello test user (hello@laine.ai)",
        "manuel amigo test (amigo@gmail.com)",
      ],
    });
  });
});

describe("getCatalog", () => {
  test("an application's permissions", async () => {
    const out = await run(getCatalog, {
      kind: "applications",
      search: "figma",
    });
    expect(out).toMatchObject({
      applications: [
        {
          name: "Figma",
          category: "Core business",
          permissions: ["Viewer", "Editor", "Admin"],
        },
      ],
      equipment: undefined,
    });
  });
});
