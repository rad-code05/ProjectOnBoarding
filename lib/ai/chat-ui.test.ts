import { describe, expect, test } from "vitest";
import { chatProblem, greeting, starterQuestions, toolStep } from "./chat-ui";

describe("greeting", () => {
  test("morning, afternoon, evening by the hour", () => {
    expect(greeting("Raju", 8)).toBe("Good morning, Raju.");
    expect(greeting("Raju", 14)).toBe("Good afternoon, Raju.");
    expect(greeting("Moises", 19)).toBe("Good evening, Moises.");
  });
});

describe("starterQuestions", () => {
  test("approvers get questions about approving; IT about requests", () => {
    expect(starterQuestions(["approver"])).toContain(
      "How do I confirm and sign a request?",
    );
    expect(starterQuestions(["admin", "requester"])).toContain(
      "How is the offboarding SLA counted?",
    );
  });
});

describe("chatProblem (board: App help, off-topic, limits)", () => {
  const tz = "Asia/Dubai";
  test("limits and settings in plain words", () => {
    expect(chatProblem('{"error":"not_configured"}', tz)).toMatchObject({
      title: "The assistant isn't set up yet",
      retry: false,
    });
    expect(chatProblem('{"error":"off","resetsAt":null}', tz).title).toBe(
      "The assistant is switched off",
    );
    expect(
      chatProblem('{"error":"budget","resetsAt":"2026-10-31T20:00:00Z"}', tz),
    ).toMatchObject({
      title: "The assistant is paused for this month",
      text: expect.stringContaining("It starts again on 1 Nov"),
    });
    expect(
      chatProblem('{"error":"rate","resetsAt":"2026-10-23T08:12:00Z"}', tz)
        .text,
    ).toContain("Try again at 12:12");
  });

  test("anything else: something went wrong, try again", () => {
    expect(chatProblem("Failed to fetch", tz)).toMatchObject({
      kind: "error",
      retry: true,
    });
    expect(chatProblem(undefined).kind).toBe("error");
  });
});

describe("toolStep", () => {
  test("help steps in plain words", () => {
    expect(toolStep("getAppHelp", false, null)).toBe("Reading the help…");
    expect(toolStep("getAppHelp", true, { title: "Statuses & who acts" })).toBe(
      "Read the help page Statuses & who acts",
    );
    expect(toolStep("someTool", true, null)).toBe("Looked it up");
  });
});
