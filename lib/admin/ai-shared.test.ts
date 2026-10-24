// @vitest-environment node
import { describe, expect, test } from "vitest";
import { aiSettingsInput, usageCount, usageLine } from "./ai-shared";

describe("Admin → AI settings helpers", () => {
  test("usage line as on the board", () => {
    expect(usageLine(11.4, 50)).toBe("$11.40 of $50 · 23%");
    expect(usageLine(0, 50)).toBe("$0 of $50 · 0%");
    expect(usageLine(60, 50)).toBe("$60 of $50 · 120%");
    expect(usageLine(1, 0)).toBe("$1 of $0 · 100%");
  });

  test("questions and people", () => {
    expect(usageCount(214, 3)).toBe("214 questions by 3 people");
    expect(usageCount(1, 1)).toBe("1 question by 1 person");
    expect(usageCount(0, 0)).toBe("No questions yet this month");
  });

  test("the same limits the database checks", () => {
    const ok = { enabled: true, model: 1, budget: 50, hourly: 30 };
    expect(aiSettingsInput.safeParse(ok).success).toBe(true);
    expect(aiSettingsInput.safeParse({ ...ok, budget: -1 }).success).toBe(
      false,
    );
    expect(aiSettingsInput.safeParse({ ...ok, hourly: 0 }).success).toBe(false);
    expect(aiSettingsInput.safeParse({ ...ok, hourly: 2.5 }).success).toBe(
      false,
    );
  });
});
