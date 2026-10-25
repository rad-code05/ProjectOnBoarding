import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const run = vi.fn();
vi.mock("@/lib/reports/custom/store", () => ({
  runCustomReport: (...args: unknown[]) => run(...args),
}));

const { saveCustomReport, catalogueText } =
  await import("./save-custom-report");
const { definitionSchema } = await import("@/lib/reports/custom/definition");
const { runPart } = await import("@/lib/reports/custom/engine");

const ID = "6f9619ff-8b86-4011-b42d-00c04fc964ff";

/** custom_reports through RLS: insert gives a new id; update finds mine only. */
function fakeDb(mine: string[] = []) {
  const calls: { op: string; row?: unknown; id?: string }[] = [];
  const db = {
    from: () => ({
      insert: (row: unknown) => {
        calls.push({ op: "insert", row });
        return {
          select: () => ({
            single: async () => ({ data: { id: ID }, error: null }),
          }),
        };
      },
      update: (row: unknown) => ({
        eq: (_: string, id: string) => {
          calls.push({ op: "update", row, id });
          return {
            select: () => ({
              maybeSingle: async () => ({
                data: mine.includes(id) ? { id } : null,
                error: null,
              }),
            }),
          };
        },
      }),
    }),
  };
  return { db, calls };
}

const definition = {
  title: "Dubai joiners with Slack",
  parts: [
    {
      title: "Dubai joiners",
      dataset: "people",
      where: { op: "holds", mode: "all", items: [{ item: "Slack" }] },
      columns: ["name", "office"],
    },
  ],
};

async function call(input: unknown, mine: string[] = []) {
  const { db, calls } = fakeDb(mine);
  const t = saveCustomReport.build({
    userId: "user_1",
    roles: ["admin"],
    timeZone: "Asia/Dubai",
    db: db as never,
  });
  const out = await t.execute!(
    input as never,
    {
      toolCallId: "1",
      messages: [],
    } as never,
  );
  return { out, calls };
}

beforeEach(() => {
  run.mockReset();
  const def = definitionSchema.parse(definition);
  run.mockResolvedValue([
    {
      part: def.parts[0],
      result: runPart(
        def.parts[0],
        Array.from({ length: 7 }, (_, i) => ({
          name: `Person ${i + 1}`,
          office: "Dubai",
          holds: ["Slack · Member"],
        })),
        "Asia/Dubai",
      ),
    },
  ]);
});

describe("saveCustomReport (F17a)", () => {
  test("report readers only, saves their own report without a Confirm", () => {
    expect(saveCustomReport.roles).toEqual(["admin", "approver", "auditor"]);
    expect(saveCustomReport).toMatchObject({
      kind: "own",
      needsApproval: false,
    });
  });

  test("the model is told the catalogue and the rules — and nothing about SQL", () => {
    const text = catalogueText();
    expect(text).toContain("- people = People today");
    expect(text).toContain("Supports the 'holds' condition.");
    expect(text).toContain("time_to_approve (duration");
    expect(text).not.toMatch(/sql|select \*|table/i);
  });

  test("builds: checked, run with the asker's access, saved, counts + a short preview + the link", async () => {
    const def = definitionSchema.parse(definition);
    const { out, calls } = await call({ definition: def });
    expect(run).toHaveBeenCalledWith(def, "Asia/Dubai", expect.anything());
    expect(calls).toEqual([
      {
        op: "insert",
        row: { title: "Dubai joiners with Slack", definition: def },
      },
    ]);
    expect(out).toMatchObject({
      changed: false,
      reportId: ID,
      link: `/reports/custom/${ID}`,
      parts: [
        {
          title: "Dubai joiners",
          how: "From People today · holds Slack · columns name and office",
          rows: 7,
          truncated: false,
          first: [
            "Person 1 · Dubai",
            "Person 2 · Dubai",
            "Person 3 · Dubai",
            "Person 4 · Dubai",
            "Person 5 · Dubai",
          ],
        },
      ],
    });
  });

  test("a definition that doesn't fit comes back with plain-word problems — nothing run or saved", async () => {
    const bad = definitionSchema.parse({
      title: "Salaries",
      parts: [{ title: "p", dataset: "people", columns: ["salary"] }],
    });
    const { out, calls } = await call({ definition: bad });
    expect(out).toEqual({
      error: "Fix the definition.",
      problems: ['Part 1 (People today): there is no field "salary".'],
    });
    expect(run).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  test("changes my own report; someone else's (or a gone one) is refused", async () => {
    const def = definitionSchema.parse(definition);
    const mine = await call({ reportId: ID, definition: def }, [ID]);
    expect(mine.out).toMatchObject({ changed: true, reportId: ID });
    expect(mine.calls[0]).toMatchObject({ op: "update", id: ID });

    const other = "00000000-0000-0000-0000-00000000c0ff";
    const theirs = await call({ reportId: other, definition: def }, [ID]);
    expect(theirs.out).toEqual({
      error:
        "That report isn't one of yours, or no longer exists. Build a new one.",
    });
  });

  test("the input schema refuses anything outside the language", () => {
    const schema = saveCustomReport.build({
      userId: "u",
      roles: ["admin"],
      timeZone: "Asia/Dubai",
      db: {} as never,
    }).inputSchema as unknown as {
      safeParse: (x: unknown) => { success: boolean };
    };
    expect(schema.safeParse({ definition }).success).toBe(true);
    expect(
      schema.safeParse({ definition: { ...definition, sql: "drop table x" } })
        .success,
    ).toBe(true); // unknown keys are dropped, never used
    expect(
      schema.safeParse({
        definition: {
          title: "x",
          parts: [{ title: "p", dataset: "audit_events", columns: ["action"] }],
        },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ reportId: "not-a-uuid", definition }).success,
    ).toBe(false);
  });
});
