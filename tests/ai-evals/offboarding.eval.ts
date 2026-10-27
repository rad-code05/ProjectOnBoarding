// Offboarding by chat against the REAL model (F16e-2): the robot asks about
// every topic — incl. how the applications are removed and the mailbox
// (Raju, 2026-10-27) — before the Confirm card, and the card carries what was
// said. Opt-in, part of `pnpm test:ai-reports` (ANTHROPIC_API_KEY in
// .env.local; AI_EVAL_MODEL picks the model) — a few cents. Never part of
// `pnpm test` or CI.
//
// The database is a stand-in that knows one person who holds Slack (Arjun
// Mehta) and nothing else, so the checks run on the robot's questions, and
// nothing is created (a Confirm card stops the run before any write).
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, isStepCount } from "ai";
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { systemInstructions } = await import("@/lib/ai/system");
const { toolApprovalFor, toolsFor } = await import("@/lib/ai/tools/registry");

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.AI_EVAL_MODEL || "claude-sonnet-5-5";

const ARJUN = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
const TABLES: Record<string, unknown[]> = {
  employee_access_inventory: [
    {
      id: "a1b2c3d4-0000-4000-8000-000000000001",
      employee_id: ARJUN,
      kind: "application",
      app_id: 3,
      equipment_type_id: null,
      access_type_id: null,
      name: "Slack",
      category_name: "Core business",
      permission: "Regular Member",
      asset_tag: null,
      description: null,
      granted_at: "2026-01-05T08:00:00Z",
      granted: { ticket_id: "UAM-2026-000100" },
    },
  ],
  employees: [
    {
      id: ARJUN,
      work_email: "arjun.mehta@example.com",
      first_name: "Arjun",
      last_name: "Mehta",
    },
  ],
  requests: [
    {
      employee_id: ARJUN,
      first_name: "Arjun",
      last_name: "Mehta",
      country: "AE",
      closed_at: "2026-01-06T08:00:00Z",
      department: { name: "Sales" },
    },
  ],
  catalog_apps: [
    {
      id: 3,
      name: "Slack",
      actions: ["Grant", "Remove"],
      permissions: ["Regular Member", "Workspace Admin"],
      multi_permission: false,
    },
  ],
};

/** Every query on a table answers with its rows; open requests: none. */
function arjunDb(): unknown {
  const query = (table: string) => {
    let rows = TABLES[table] ?? [];
    const chain: unknown = new Proxy(() => chain, {
      get(_target, prop) {
        if (prop === "then")
          return (resolve: (r: unknown) => unknown) =>
            resolve({ data: rows, error: null, count: rows.length });
        if (prop === "maybeSingle" || prop === "single")
          return async () => ({ data: null, error: null });
        if (prop === "in")
          return (column: string) => {
            // Open offboardings / access changes: nobody has one.
            if (column === "type") rows = [];
            return chain;
          };
        return () => chain;
      },
    });
    return chain;
  };
  return { from: query, rpc: () => query("") };
}

async function ask(question: string) {
  const ctx = {
    userId: "user_eval",
    roles: ["admin" as const, "requester" as const, "it_operator" as const],
    timeZone: "Asia/Dubai",
    db: arjunDb() as never,
  };
  const result = await generateText({
    model: createAnthropic({ apiKey: KEY })(MODEL),
    instructions: systemInstructions({
      name: "Raju",
      roles: ctx.roles,
      now: "Wednesday 28 October 2026, 10:00",
      timeZone: "Asia/Dubai",
    }),
    prompt: question,
    tools: toolsFor(ctx),
    toolApproval: toolApprovalFor(ctx),
    stopWhen: isStepCount(6),
    maxOutputTokens: 1200,
  });
  // A Confirm card = an approval request the person must answer.
  const cards = result.steps.flatMap((s) =>
    s.content.flatMap((c) =>
      c.type === "tool-approval-request" && !c.isAutomatic ? [c.toolCall] : [],
    ),
  );
  const text = result.text.toLowerCase();
  console.log(
    `\n— ${question}\n  cards: ${cards.map((c) => c.toolName).join(", ") || "none"}\n  ${result.text.replace(/\n/g, "\n  ")}`,
  );
  return { text, cards };
}

describe.skipIf(!KEY)(`offboarding by chat — ${MODEL}`, () => {
  test("timing and handover given: still asks about the removal method and the mailbox", async () => {
    const { text, cards } = await ask(
      "Arjun Mehta is leaving. Last working day Friday 30 October, cut-off 18:00 the same day, Rafiq Ahmed takes over his data.",
    );
    expect(cards).toEqual([]);
    expect(text).toMatch(/mailbox/);
    expect(text).toMatch(/delete|suspend|disable/);
  });

  test("everything said: the card carries the method, the mailbox and the handover", async () => {
    const { cards } = await ask(
      "Arjun Mehta is leaving. Last working day Friday 30 October, SLA same day, cut-off 18:00 on the 30th, Rafiq Ahmed takes over. Suspend all his applications and convert his mailbox to a shared mailbox.",
    );
    const card = cards.find((c) => c.toolName === "createOffboardingDraft");
    expect(card).toBeDefined();
    expect(card?.input).toMatchObject({
      removalMethod: "Suspend",
      mailbox: "converted_shared",
      lastWorkingDay: "2026-10-30",
    });
    expect(JSON.stringify(card?.input)).toMatch(/rafiq/i);
  });

  test("no handover — the data is deleted: written down as said, not left empty", async () => {
    const { cards } = await ask(
      "Arjun Mehta leaves on Friday 30 October, SLA within 24 h, cut-off 18:00 that day. No handover, his data gets deleted. Delete his applications; he has no mailbox to convert.",
    );
    const card = cards.find((c) => c.toolName === "createOffboardingDraft");
    expect(card).toBeDefined();
    const input = card?.input as Record<string, unknown>;
    expect(String(input.handoverTo)).toMatch(/delet/i);
    expect(input).toMatchObject({
      removalMethod: "Delete",
      mailbox: "no_mailbox",
    });
  });
});
