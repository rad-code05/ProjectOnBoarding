// Filling requests by chat against the REAL model (F16c): nothing is missed
// before the Confirm card (Raju, 2026-10-26). Opt-in, part of
// `pnpm test:ai-reports` (ANTHROPIC_API_KEY in .env.local; AI_EVAL_MODEL
// picks the model) — a few cents. Never part of `pnpm test` or CI.
//
// The database is a stand-in that returns nothing, so nothing is created:
// the set checks that the robot asks before the person is asked to Confirm.
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, isStepCount } from "ai";
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { systemInstructions } = await import("@/lib/ai/system");
const { toolApprovalFor, toolsFor } = await import("@/lib/ai/tools/registry");

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.AI_EVAL_MODEL || "claude-sonnet-5-5";

function emptyDb(): unknown {
  const result = { data: [], error: null, count: 0 };
  const chain: unknown = new Proxy(() => chain, {
    get(_target, prop) {
      if (prop === "then")
        return (resolve: (r: typeof result) => unknown) => resolve(result);
      return () => chain;
    },
  });
  return { from: () => chain, rpc: () => chain };
}

async function ask(question: string) {
  const ctx = {
    userId: "user_eval",
    roles: ["admin" as const, "requester" as const, "it_operator" as const],
    timeZone: "Asia/Dubai",
    db: emptyDb() as never,
  };
  const result = await generateText({
    model: createAnthropic({ apiKey: KEY })(MODEL),
    instructions: systemInstructions({
      name: "Raju",
      roles: ctx.roles,
      now: "Monday 26 October 2026, 10:00",
      timeZone: "Asia/Dubai",
    }),
    prompt: question,
    tools: toolsFor(ctx),
    toolApproval: toolApprovalFor(ctx),
    stopWhen: isStepCount(5),
    maxOutputTokens: 1200,
  });
  // A Confirm card = an approval request the person must answer.
  const confirmCards = result.steps.flatMap((s) =>
    s.content.filter(
      (c) => c.type === "tool-approval-request" && !c.isAutomatic,
    ),
  );
  const tools = result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName));
  return { text: result.text.toLowerCase(), confirmCards, tools };
}

describe.skipIf(!KEY)(`filling by chat — ${MODEL}`, () => {
  test("a quick draft with the name, office and one app: the robot asks first", async () => {
    const { text, confirmCards } = await ask(
      "Create an onboarding draft for Meera Test, Dubai office, Slack Regular Member.",
    );
    expect(confirmCards).toEqual([]);
    for (const topic of ["email", "equipment", "manager", "start"]) {
      expect(text).toContain(topic);
    }
  });

  test("only an email: still the whole checklist, never a card", async () => {
    const { text, confirmCards } = await ask(
      "Just create an onboarding draft for test2@test.com.",
    );
    expect(confirmCards).toEqual([]);
    expect(text).toMatch(/name/);
    expect(text).toMatch(/office/);
  });

  test("add a value to a draft that exists: suggestions on it, never a second draft", async () => {
    const { tools, confirmCards } = await ask(
      "Add the work email meera.test@laine.ai to UAM-2026-000404.",
    );
    expect(tools).toContain("suggestValues");
    expect(tools).not.toContain("createOnboardingDraft");
    expect(confirmCards).toEqual([]);
  });

  test("two work emails: asks which one (the form has one)", async () => {
    const { text, tools } = await ask(
      "Add the primary email test2@test.com and test2@gmail.com to UAM-2026-000404.",
    );
    expect(tools).not.toContain("createOnboardingDraft");
    expect(text).toMatch(/which/);
  });
});
