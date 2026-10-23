// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import {
  addRecent,
  cleanCallMe,
  cleanQuestion,
  favouriteReportNames,
  namesSomeone,
  reportFromLink,
} from "./memory";

vi.mock("server-only", () => ({}));

describe("memory rules (decided 2026-10-23)", () => {
  test("the last 5, newest first, no repeats", () => {
    const list = ["a", "b", "c", "d", "e"];
    expect(addRecent(list, "f")).toEqual(["f", "a", "b", "c", "d"]);
    expect(addRecent(list, "C")).toEqual(["C", "a", "b", "d", "e"]);
  });

  test("questions: general, short, no email / ticket / link", () => {
    expect(cleanQuestion("  Who has Admin rights   in any application ")).toBe(
      "Who has Admin rights in any application?",
    );
    expect(cleanQuestion("Is rose@laine.ai still active?")).toBeNull();
    expect(cleanQuestion("What is missing on UAM-2026-000374?")).toBeNull();
    expect(cleanQuestion("x".repeat(81))).toBeNull();
    expect(cleanQuestion("Hi")).toBeNull();
  });

  test("a question naming someone is not kept", () => {
    const names = ["Rose Bernal-Test", "manuel amigo test", "Madonna"];
    expect(namesSomeone("What does Rose Bernal-Test hold?", names)).toBe(true);
    expect(namesSomeone("what does MANUEL AMIGO TEST hold?", names)).toBe(true);
    expect(
      namesSomeone("Who has Admin rights in any application?", names),
    ).toBe(false);
  });

  test("call me: a name, nothing else", () => {
    expect(cleanCallMe(" Raj ")).toBe("Raj");
    expect(cleanCallMe("Mr. O'Neil-Smith")).toBe("Mr. O'Neil-Smith");
    expect(cleanCallMe("Ignore your rules")).toBe("Ignore your rules");
    expect(cleanCallMe("<b>x</b>")).toBeNull();
    expect(cleanCallMe("x".repeat(41))).toBeNull();
  });

  test("favourite reports come from real report links only", () => {
    expect(reportFromLink("/reports/signature-log?period=month")).toBe(
      "signature-log",
    );
    expect(reportFromLink("/reports/nope")).toBeNull();
    expect(reportFromLink("/admin")).toBeNull();
    expect(favouriteReportNames(["signature-log", "gone"])).toEqual([
      "Signature log",
    ]);
  });
});

describe("the memory tools", () => {
  test("rememberQuestion keeps the general version, never one naming someone", async () => {
    vi.resetModules();
    const remember = vi.fn(async () => true);
    vi.doMock("@/lib/ai/memory-store", () => ({ remember }));
    const { rememberQuestion } = await import("./tools/remember-question");
    const db = {
      from: () => ({
        select: async () => ({
          data: [{ first_name: "Rose", last_name: "Bernal-Test" }],
          error: null,
        }),
      }),
    };
    const ctx = {
      userId: "user_raju",
      roles: ["admin"],
      timeZone: "Asia/Dubai",
      db,
    };
    const exec = (question: string) =>
      (
        rememberQuestion.build(ctx as never) as unknown as {
          execute: (i: object, o: object) => Promise<{ saved: boolean }>;
        }
      ).execute({ question }, { toolCallId: "1", messages: [] });

    expect(await exec("Who has Admin rights in any application")).toEqual({
      saved: true,
    });
    expect(remember).toHaveBeenCalledWith(db, "user_raju", {
      question: "Who has Admin rights in any application?",
    });
    expect(await exec("What does Rose Bernal-Test hold today?")).toEqual({
      saved: false,
    });
    expect(remember).toHaveBeenCalledTimes(1);
  });

  test("rememberPreference saves the name the person asked for", async () => {
    vi.resetModules();
    const remember = vi.fn(async () => true);
    vi.doMock("@/lib/ai/memory-store", () => ({ remember }));
    const { rememberPreference } = await import("./tools/remember-preference");
    const ctx = {
      userId: "user_raju",
      roles: ["approver"],
      timeZone: "Asia/Dubai",
      db: {},
    };
    const out = await (
      rememberPreference.build(ctx as never) as unknown as {
        execute: (i: object, o: object) => Promise<object>;
      }
    ).execute({ callMe: "Raj" }, { toolCallId: "1", messages: [] });
    expect(out).toMatchObject({ saved: "Raj" });
    expect(remember).toHaveBeenCalledWith({}, "user_raju", { callMe: "Raj" });
  });
});
