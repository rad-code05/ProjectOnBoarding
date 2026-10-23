import type { UIMessage } from "ai";
import { describe, expect, test } from "vitest";
import {
  answeredOnServer,
  chatProblem,
  greeting,
  lastIsQuestion,
  lastQuestion,
  starterQuestions,
  stepLink,
  toolStep,
} from "./chat-ui";

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
      "How long did approvals take this month?",
    );
    expect(starterQuestions(["admin", "requester"])).toContain(
      "Who has Admin rights in any application?",
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
    expect(toolStep("runReport", true, { report: "Onboarded by office" })).toBe(
      "Ran the report Onboarded by office",
    );
    expect(toolStep("runReport", true, { error: "x" })).toBe(
      "Couldn't run the report",
    );
  });

  test("the report link: only our own report pages", () => {
    expect(stepLink({ link: "/reports/onboarded-by-office?office=1" })).toBe(
      "/reports/onboarded-by-office?office=1",
    );
    expect(stepLink({ link: "https://evil.example" })).toBeNull();
    expect(stepLink({ link: "javascript:alert(1)" })).toBeNull();
    expect(stepLink(null)).toBeNull();
  });
});

describe("after a lost connection", () => {
  const q = (text: string) =>
    ({ id: text, role: "user", parts: [{ type: "text", text }] }) as UIMessage;
  const a = (text: string) =>
    ({
      id: text,
      role: "assistant",
      parts: [{ type: "text", text }],
    }) as UIMessage;

  test("a chat ending with a question is still waiting for its answer", () => {
    expect(lastIsQuestion([q("Hi"), a("Hello.")])).toBe(false);
    expect(lastIsQuestion([q("Hi"), a("Hello."), q("Slack?")])).toBe(true);
    expect(lastIsQuestion([])).toBe(false);
  });

  test("the server answered this very question meanwhile", () => {
    const saved = [q("Hi"), a("Hello."), q("Slack?"), a("Two people.")];
    expect(answeredOnServer(saved, "Slack?")).toBe(true);
    expect(answeredOnServer(saved.slice(0, 3), "Slack?")).toBe(false);
    // The question never reached the server: ask again.
    expect(answeredOnServer(saved.slice(0, 2), "Slack?")).toBe(false);
    expect(lastQuestion(saved)).toBe("Slack?");
  });
});
