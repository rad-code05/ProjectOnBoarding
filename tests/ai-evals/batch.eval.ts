// Batches by chat against the REAL model (F17b-6a): several people in one
// message become one batch of the right kind (joiners, leavers, role
// changes), with the values as said; "create the drafts" on an attached list
// gives a Confirm card with exactly the ready names. Opt-in, part of
// `pnpm test:ai-reports` (ANTHROPIC_API_KEY in .env.local; AI_EVAL_MODEL
// picks the model) — a few cents. Never part of `pnpm test` or CI.
//
// The database is a stand-in that holds one batch and nothing else: saving a
// new batch fails, so the checks run on what the robot sent, and a Confirm
// card stops the run before any write.
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, isStepCount } from "ai";
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { systemInstructions } = await import("@/lib/ai/system");
const { toolApprovalFor, toolsFor } = await import("@/lib/ai/tools/registry");

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.AI_EVAL_MODEL || "claude-sonnet-5-5";

const BATCH = "0b7c6a52-3f1e-4d2a-9c11-5e0f7a9b2c41";

type Row = {
  position: number;
  values: Record<string, string>;
  problems: { field: string; message: string }[];
};

const JOINERS: Row[] = [
  {
    position: 1,
    values: {
      firstName: "Meera",
      lastName: "Nair",
      department: "Engineering",
      office: "Dubai",
      startDate: "2026-11-02",
    },
    problems: [],
  },
  {
    position: 2,
    values: {
      firstName: "Abdul",
      lastName: "Rahman",
      department: "Finanse",
      office: "Dubai",
      startDate: "2026-11-02",
    },
    problems: [
      { field: "department", message: "“Finanse” is not in the list." },
    ],
  },
  {
    position: 3,
    values: {
      firstName: "Tom",
      lastName: "Becker",
      department: "Sales",
      office: "Dubai",
      startDate: "2026-11-02",
    },
    problems: [],
  },
];

const LEAVERS: Row[] = [
  {
    position: 1,
    values: { person: "Arjun Mehta", lastWorkingDay: "2026-11-06" },
    problems: [],
  },
  {
    position: 2,
    values: { person: "Lina Haddad", lastWorkingDay: "2026-11-06" },
    problems: [],
  },
];

/** A database that holds one batch of the given kind and nothing else. */
function batchDb(type: string, rows: Row[]): unknown {
  const batch = {
    id: BATCH,
    type,
    title: "From a file",
    source: "file",
    file_name: "list.xlsx",
    status: "open",
    created_at: "2026-10-30T08:00:00Z",
    confirmed_at: null,
    settings:
      type === "offboarding"
        ? { slaTimeline: "Same day", cutoffTime: "18:00" }
        : {},
  };
  const stored = rows.map((r) => ({
    id: `row-${r.position}`,
    position: r.position,
    included: true,
    data: { values: r.values, other: {} },
    problems: r.problems,
    request_id: null,
    request: null,
  }));
  const query = (table: string) => {
    const many = table === "request_batch_rows" ? stored : [];
    const one = table === "request_batches" ? batch : null;
    const chain: unknown = new Proxy(() => chain, {
      get(_target, prop) {
        if (prop === "then")
          return (resolve: (r: unknown) => unknown) =>
            resolve({ data: many, error: null, count: many.length });
        if (prop === "maybeSingle" || prop === "single")
          return async () => ({ data: one, error: null });
        return () => chain;
      },
    });
    return chain;
  };
  return { from: query, rpc: () => query("") };
}

const attached = (more: string) =>
  `Attached list “list.xlsx” (batch ${BATCH}).\n${more}`;

async function ask(question: string, db: unknown = batchDb("onboarding", [])) {
  const ctx = {
    userId: "user_eval",
    roles: ["admin" as const, "requester" as const, "it_operator" as const],
    timeZone: "Asia/Dubai",
    db: db as never,
  };
  const result = await generateText({
    model: createAnthropic({ apiKey: KEY })(MODEL),
    instructions: systemInstructions({
      name: "Raju",
      roles: ctx.roles,
      now: "Friday 30 October 2026, 10:00",
      timeZone: "Asia/Dubai",
    }),
    prompt: question,
    tools: toolsFor(ctx),
    toolApproval: toolApprovalFor(ctx),
    stopWhen: isStepCount(6),
    maxOutputTokens: 1500,
  });
  const calls = result.steps.flatMap((s) => s.toolCalls);
  const first = (name: string) =>
    calls.find((c) => c.toolName === name)?.input as
      Record<string, unknown> | undefined;
  const cards = result.steps.flatMap((s) =>
    s.content.flatMap((c) =>
      c.type === "tool-approval-request" && !c.isAutomatic ? [c.toolCall] : [],
    ),
  );
  console.log(
    `\n— ${question}\n  tools: ${calls.map((c) => c.toolName).join(", ") || "none"} · cards: ${cards.map((c) => c.toolName).join(", ") || "none"}\n  ${result.text.replace(/\n/g, "\n  ")}`,
  );
  return { tools: calls.map((c) => c.toolName), first, cards };
}

describe.skipIf(!KEY)(`batches by chat — ${MODEL}`, () => {
  test("three joiners in one message: one batch, shared values on everyone, no invented emails", async () => {
    const { tools, first } = await ask(
      "Three joiners in Dubai, all starting Monday 2 November: Meera Nair (Engineering, backend developer), Tom Becker (Sales) and Sara Lopez (Finance).",
    );
    expect(tools).not.toContain("createOnboardingDraft");
    const people = first("proposeBatch")?.people as Record<string, string>[];
    expect(people).toHaveLength(3);
    for (const p of people) {
      expect(p.startDate).toBe("2026-11-02");
      expect(p.office).toMatch(/dubai/i);
      expect(p.workEmail).toBeUndefined();
    }
  });

  test("leavers: one leaver batch, the shared values once for everyone", async () => {
    const { first } = await ask(
      "Arjun Mehta and Lina Haddad both leave on Friday 6 November. Same day SLA, cut-off 18:00, suspend all their applications, convert their mailboxes to shared, the line manager takes their data.",
    );
    const input = first("proposeLeaverBatch");
    expect(input).toBeDefined();
    const leavers = input?.leavers as Record<string, string>[];
    expect(leavers.map((l) => l.person)).toEqual([
      "Arjun Mehta",
      "Lina Haddad",
    ]);
    for (const l of leavers) expect(l.lastWorkingDay).toBe("2026-11-06");
    expect(input?.sameForEveryone).toMatchObject({
      removalMethod: expect.stringMatching(/suspend/i),
      mailbox: expect.stringMatching(/shared/i),
    });
  });

  test("role changes: change, add and remove per person, the date as said", async () => {
    const { first } = await ask(
      "Role changes from Sunday 1 November: Meera Nair becomes Slack Workspace Admin and gets Notion (Member); Tom Becker returns laptop LT-1008 and loses Figma.",
    );
    const input = first("proposeChangeBatch");
    expect(input).toBeDefined();
    const text = JSON.stringify(input);
    expect(text).toMatch(/2026-11-01/);
    expect(text).toMatch(/Workspace Admin/);
    expect(text).toMatch(/Notion/);
    expect(text).toMatch(/LT-1008/);
    expect(text).toMatch(/Figma/);
  });

  test("an attached list, 'create the drafts': the card names exactly the ready rows", async () => {
    const { tools, cards } = await ask(
      attached("Create the drafts."),
      batchDb("onboarding", JOINERS),
    );
    expect(tools).toContain("getBatch");
    const card = cards.find((c) => c.toolName === "createBatchDrafts");
    expect(card).toBeDefined();
    const input = card?.input as {
      kind: string;
      create: string[];
      notCreated: string[];
    };
    expect(input.kind).toBe("onboarding");
    expect([...input.create].sort()).toEqual(["Meera Nair", "Tom Becker"]);
    expect(input.notCreated).toEqual(["Abdul Rahman"]);
  });

  test("an attached leaver list, 'cut-off 17:00 for everyone': the shared value, no card", async () => {
    const { first, cards } = await ask(
      attached("Make the cut-off 17:00 for everyone."),
      batchDb("offboarding", LEAVERS),
    );
    const input = first("setSameForEveryone");
    expect(input).toBeDefined();
    expect(input?.values).toMatchObject({ cutoffTime: "17:00" });
    expect(cards).toEqual([]);
  });
});
