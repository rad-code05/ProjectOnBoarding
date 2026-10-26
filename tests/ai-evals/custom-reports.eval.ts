// Report test set against the REAL model (F17a-6b): about 25 report
// requests, from simple to strange, each with a check on what the robot
// asked the custom report tool for — or that it asked back, or said no.
// Opt-in: `pnpm test:ai-reports` (ANTHROPIC_API_KEY in .env.local;
// AI_EVAL_MODEL picks the model, default Claude Sonnet 5.5). One run costs
// well under a dollar. Never part of `pnpm test` or CI.
//
// The database behind the tools is a stand-in that returns nothing: the set
// checks how the robot reads requests, not the data.
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, isStepCount } from "ai";
import { describe, expect, test, vi } from "vitest";
import type { Role } from "@/lib/auth";

vi.mock("server-only", () => ({}));

const { systemInstructions } = await import("@/lib/ai/system");
const { toolApprovalFor, toolsFor } = await import("@/lib/ai/tools/registry");
const { checkDefinition, definitionSchema } =
  await import("@/lib/reports/custom/definition");
type Definition = import("@/lib/reports/custom/definition").Definition;
type Where = import("@/lib/reports/custom/definition").Where;
type Condition = import("@/lib/reports/custom/definition").Condition;

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.AI_EVAL_MODEL || "claude-sonnet-5-5";

function emptyDb(): unknown {
  const result = { data: [], error: null, count: 0 };
  const chain: unknown = new Proxy(() => chain, {
    get(_target, prop) {
      if (prop === "then")
        return (resolve: (r: typeof result) => unknown) => resolve(result);
      if (prop === "maybeSingle" || prop === "single")
        return async () => ({
          data: { id: "6f9619ff-8b86-4011-b42d-00c04fc964ff" },
          error: null,
        });
      return () => chain;
    },
  });
  return { from: () => chain, rpc: () => chain };
}

type Outcome = { defs: Definition[]; tools: string[]; text: string };

async function ask(
  question: string,
  roles: Role[] = ["admin"],
): Promise<Outcome> {
  const ctx = {
    userId: "user_eval",
    roles,
    timeZone: "Asia/Dubai",
    db: emptyDb() as never,
  };
  const result = await generateText({
    model: createAnthropic({ apiKey: KEY })(MODEL),
    instructions: systemInstructions({
      name: "Raju",
      roles,
      now: "Sunday 25 October 2026, 10:00",
      timeZone: "Asia/Dubai",
    }),
    prompt: question,
    tools: toolsFor(ctx),
    toolApproval: toolApprovalFor(ctx),
    stopWhen: isStepCount(5),
    maxOutputTokens: 2000,
  });
  const calls = result.steps.flatMap((s) => s.toolCalls);
  const defs = calls
    .filter((c) => c.toolName === "saveCustomReport")
    .map((c) =>
      definitionSchema.parse((c.input as { definition: unknown }).definition),
    );
  console.log(
    `\n— ${question}\n  tools: ${calls.map((c) => c.toolName).join(", ") || "none"}\n  ${defs
      .map((d) => JSON.stringify(d))
      .join("\n  ")}\n  ${result.text.slice(0, 300).replace(/\n/g, "\n  ")}`,
  );
  return { defs, tools: calls.map((c) => c.toolName), text: result.text };
}

/** Every condition in a definition, flattened (with "not" marked). */
function conds(def: Definition): (Condition & { negated?: boolean })[] {
  const walk = (
    w: Where,
    negated = false,
  ): (Condition & { negated?: boolean })[] =>
    "all" in w
      ? w.all.flatMap((x) => walk(x, negated))
      : "any" in w
        ? w.any.flatMap((x) => walk(x, negated))
        : "not" in w
          ? walk(w.not, !negated)
          : [{ ...w, negated }];
  return def.parts.flatMap((p) => (p.where ? walk(p.where) : []));
}
const last = (o: Outcome) => {
  expect(o.defs.length, "built a custom report").toBeGreaterThan(0);
  const def = o.defs.at(-1)!;
  expect(checkDefinition(def)).toEqual([]);
  return def;
};
const lower = (v: unknown) => String(v).toLowerCase();
const holds = (def: Definition, item: string, mode?: "all" | "any" | "none") =>
  conds(def).some(
    (c) =>
      c.op === "holds" &&
      (!mode || c.mode === mode || (mode === "none" && c.negated)) &&
      c.items.some((i) => lower(i.item) === lower(item)),
  );
const hasCond = (def: Definition, op: string, field?: string) =>
  conds(def).some(
    (c) => c.op === op && (!field || ("field" in c && c.field === field)),
  );
const asksBack = (o: Outcome) => {
  expect(o.defs, "asked first, built nothing").toEqual([]);
  expect(o.text).toMatch(/\?/);
};
const saysNo = (o: Outcome) => {
  expect(o.defs).toEqual([]);
  expect(o.text).toMatch(/do(?:es)?n't|not|no |can(?:'|no)t|isn't/i);
};

describe.skipIf(!KEY)(
  `custom report requests (${MODEL})`,
  { timeout: 120_000 },
  () => {
    test("Raju's example, with real dates: Dubai + Slack AND Monday.com; Bangladeshi on even days", async () => {
      const def = last(
        await ask(
          "Employees onboarded 5–11 October 2026 in the Dubai office who hold Slack and Monday.com, and in the same report the Bangladeshi nationals onboarded in September 2026 on even-numbered days.",
        ),
      );
      expect(def.parts).toHaveLength(2);
      expect(
        holds(def, "Slack", "all") && holds(def, "Monday.com", "all"),
      ).toBe(true);
      expect(JSON.stringify(def)).toMatch(/2026-10-05/);
      expect(JSON.stringify(def)).toMatch(/"BD"/i);
      expect(hasCond(def, "day_of_month")).toBe(true);
    });

    test("Geneva people who hold Figma and GitHub", async () => {
      const def = last(
        await ask(
          "People in the Geneva office who hold both Figma and GitHub.",
        ),
      );
      expect(holds(def, "Figma", "all") && holds(def, "GitHub", "all")).toBe(
        true,
      );
      expect(JSON.stringify(def)).toMatch(/Geneva/);
    });

    test("Slack but not Zoom", async () => {
      const def = last(
        await ask(
          "Build a custom report: everyone who holds Slack but not Zoom.",
        ),
      );
      expect(holds(def, "Slack")).toBe(true);
      expect(holds(def, "Zoom", "none")).toBe(true);
    });

    test("time to approve per approver and month, as a chart", async () => {
      const def = last(
        await ask(
          "Average time to approve per approver and per month in 2026, as a chart.",
        ),
      );
      const p = def.parts[0];
      expect(p.dataset).toBe("signatures");
      expect(p.groupBy.map((g) => g.field)).toEqual(
        expect.arrayContaining(["approved_by", "approved_at"]),
      );
      expect(p.groupBy.find((g) => g.field === "approved_at")?.by).toBe(
        "month",
      );
      expect(p.measures).toContainEqual({
        fn: "avg",
        field: "time_to_approve",
      });
      expect(p.chart).toBe(true);
    });

    test("approvals that took more than 2 days (durations in hours)", async () => {
      const def = last(
        await ask(
          "Build a custom report of approvals that took more than 2 days.",
        ),
      );
      const c = conds(def).find(
        (x) =>
          (x.op === "gt" || x.op === "gte") &&
          "field" in x &&
          x.field === "time_to_approve",
      );
      expect(c && "value" in c ? c.value : null).toBe(48);
    });

    test("people onboarded on a Friday or Saturday in 2026", async () => {
      const def = last(
        await ask(
          "Custom report: people onboarded on a Friday or a Saturday in 2026.",
        ),
      );
      const c = conds(def).find((x) => x.op === "weekday");
      expect(c && "days" in c ? [...(c.days as number[])].sort() : []).toEqual([
        5, 6,
      ]);
    });

    test("people onboarded on the 1st or the 15th of any month", async () => {
      const def = last(
        await ask(
          "Custom report: people onboarded on the 1st or the 15th of a month.",
        ),
      );
      const c = conds(def).find((x) => x.op === "day_of_month");
      expect(c && "days" in c ? c.days : null).toEqual([1, 15]);
    });

    test("leavers who still hold GitHub", async () => {
      const def = last(
        await ask(
          "Custom report of people who are leaving and still hold GitHub.",
        ),
      );
      expect(holds(def, "GitHub")).toBe(true);
      expect(JSON.stringify(def)).toMatch(/"leaving"/);
    });

    test("headcount per office and department", async () => {
      const def = last(
        await ask(
          "Build a custom report: headcount today per office and department.",
        ),
      );
      const p = def.parts[0];
      expect(p.dataset).toBe("people");
      expect(p.groupBy.map((g) => g.field).sort()).toEqual([
        "department",
        "office",
      ]);
    });

    test("requests created per type in September 2026", async () => {
      const def = last(
        await ask(
          "Custom report: how many requests of each type were created in September 2026?",
        ),
      );
      const p = def.parts[0];
      expect(p.dataset).toBe("requests");
      expect(p.groupBy.map((g) => g.field)).toContain("type");
      expect(JSON.stringify(def)).toMatch(/2026-09-01|"months":\[9\]/);
    });

    test("onboardings closed in Q3 2026 by work country", async () => {
      const def = last(
        await ask(
          "Custom report: onboardings closed in Q3 2026, counted by work country.",
        ),
      );
      expect(JSON.stringify(def)).toMatch(/2026-07-01/);
      expect(JSON.stringify(def)).toMatch(/2026-09-30/);
      expect(JSON.stringify(def)).toMatch(/onboarding/);
      expect(def.parts[0].groupBy.map((g) => g.field)).toContain("country");
    });

    test("offboardings that missed the SLA this year, with the reason", async () => {
      const def = last(
        await ask(
          "Custom report: offboardings that missed the SLA in 2026, with the reason.",
        ),
      );
      const p = def.parts[0];
      expect(p.dataset).toBe("offboarding_sla");
      expect(JSON.stringify(p.where)).toMatch(/missed/);
      expect(p.columns).toContain("missed_reason");
    });

    test("laptops held today with their asset tags", async () => {
      const def = last(
        await ask(
          "Custom report: the laptops people hold today, with asset tags.",
        ),
      );
      expect(def.parts[0].dataset).toBe("access");
      expect(def.parts[0].columns).toContain("asset_tag");
    });

    test("access granted in the last 30 days, newest first", async () => {
      const def = last(
        await ask(
          "Custom report: access granted in the last 30 days, newest first.",
        ),
      );
      expect(JSON.stringify(def)).toMatch(/2026-09-2[4-6]/);
      expect(def.parts[0].sort[0]).toMatchObject({ dir: "desc" });
    });

    test("two lists in one report: Dubai and Abu Dhabi", async () => {
      const def = last(
        await ask(
          "One report with two lists: the people in the Dubai office, and the people in the Abu Dhabi office.",
        ),
      );
      expect(def.parts).toHaveLength(2);
    });

    test("Bangladeshi or Pakistani nationals", async () => {
      const def = last(
        await ask(
          "Custom report: our Bangladeshi or Pakistani nationals, by office.",
        ),
      );
      expect(JSON.stringify(def)).toMatch(/"BD"/);
      expect(JSON.stringify(def)).toMatch(/"PK"/);
    });

    test("requests returned at least once", async () => {
      const def = last(
        await ask(
          "Custom report: requests that were returned at least once, and how many times.",
        ),
      );
      expect(def.parts[0].dataset).toBe("signatures");
      expect(JSON.stringify(def.parts[0].where)).toMatch(/returns/);
    });

    test("a standard report is enough: open requests by status (runReport or a custom report)", async () => {
      const o = await ask("Show me the open requests by status.");
      expect(
        o.tools.some((t) => t === "runReport" || t === "saveCustomReport"),
      ).toBe(true);
    });

    test("an approver may build one too", async () => {
      const o = await ask(
        "Build a custom report of the people in the Dubai office who hold Slack.",
        ["approver"],
      );
      last(o);
    });

    test("vague: 'from Bangladesh' and '2 weeks ago' → reads it back and asks first", async () => {
      asksBack(
        await ask(
          "Users from Bangladesh onboarded 2 weeks ago who have Slack, as a report.",
        ),
      );
    });

    test("vague: 'recently' → asks for the period", async () => {
      asksBack(await ask("Make me a report of people who joined recently."));
    });

    test("not in the app: salaries", async () => {
      saysNo(await ask("Custom report of salaries per department."));
    });

    test("not in the app: Slack logins", async () => {
      saysNo(await ask("Custom report of who logged into Slack last week."));
    });

    test("not a data set: everyone's chats with the assistant", async () => {
      saysNo(
        await ask("Custom report of everyone's chats with the assistant."),
      );
    });

    test("the IT side alone can't build custom reports", async () => {
      const o = await ask(
        "Build me a custom report of everyone in the Dubai office who holds Slack.",
        ["requester", "it_operator"],
      );
      expect(o.tools).not.toContain("saveCustomReport");
    });
  },
);
