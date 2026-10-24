// @vitest-environment node
import type { UIMessage } from "ai";
import { describe, expect, test } from "vitest";
import {
  answeredOnServer,
  chatGroups,
  chatProblem,
  greeting,
  lastIsQuestion,
  lastQuestion,
  starterQuestions,
  stepDownloads,
  stepLink,
  stepLinkLabel,
  stepPdfLink,
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
    const id = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
    expect(stepLink({ link: `/requests/${id}` })).toBe(`/requests/${id}`);
    expect(stepLink({ link: `/records/${id}` })).toBe(`/records/${id}`);
    expect(stepLink({ link: "/requests/new?x=1" })).toBeNull();
    expect(stepLink({ link: "/admin/settings" })).toBeNull();
    expect(stepLinkLabel(`/records/${id}`)).toBe("Open the request");
    expect(stepLinkLabel("/reports/open-requests")).toBe("Open the report");
    // The record PDF: only "/records/<id>/pdf".
    expect(stepPdfLink({ pdfLink: `/records/${id}/pdf` })).toBe(
      `/records/${id}/pdf`,
    );
    expect(stepPdfLink({ pdfLink: `/records/${id}/pdf?x=1` })).toBeNull();
    expect(stepPdfLink({ pdfLink: "https://evil.example/x.pdf" })).toBeNull();
    expect(stepPdfLink({ link: `/records/${id}` })).toBeNull();
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

describe("chatGroups (board: Previous chats)", () => {
  const chat = (id: string, updatedAt: string) => ({
    id,
    title: id,
    updatedAt,
    messages: 2,
  });
  // Saturday 24 Oct 2026, 15:00 in Dubai.
  const now = new Date("2026-10-24T11:00:00Z");

  test("Today, This week (from Monday), Older — on the person's clock", () => {
    const groups = chatGroups(
      [
        chat("today", "2026-10-24T10:42:00Z"),
        chat("tuesday", "2026-10-20T08:00:00Z"),
        // Sunday 18 Oct: the week before.
        chat("old", "2026-10-18T08:00:00Z"),
      ],
      "Asia/Dubai",
      now,
    );
    expect(groups.map((g) => [g.label, g.chats.map((c) => c.when)])).toEqual([
      ["Today", ["14:42"]],
      ["This week", ["Tue 20 Oct"]],
      ["Older", ["18 Oct 2026"]],
    ]);
  });

  test("late evening UTC is already tomorrow in Dubai", () => {
    const groups = chatGroups(
      [chat("x", "2026-10-23T21:30:00Z")],
      "Asia/Dubai",
      now,
    );
    expect(groups[0].label).toBe("Today");
  });
});

describe("stepDownloads (the report's own CSV / PDF export)", () => {
  test("same filters, the export route next to the report", () => {
    expect(
      stepDownloads({
        link: "/reports/onboarded-by-office?period=12m&office=1",
      }),
    ).toEqual([
      {
        label: "Download CSV",
        href: "/reports/onboarded-by-office/export?period=12m&office=1",
      },
      {
        label: "PDF",
        href: "/reports/onboarded-by-office/export?period=12m&office=1&format=pdf",
      },
    ]);
  });

  test("one application's holders export through Access by application", () => {
    expect(
      stepDownloads({
        link: "/reports/access-by-application/holders?kind=app&item=app%3A3",
      })[0].href,
    ).toBe("/reports/access-by-application/export?kind=app&item=app%3A3");
  });

  test("no filters; and nothing for requests or other pages", () => {
    expect(stepDownloads({ link: "/reports/open-requests" })[1].href).toBe(
      "/reports/open-requests/export?format=pdf",
    );
    expect(
      stepDownloads({ link: "/records/6f9619ff-8b86-4011-b42d-00c04fc964ff" }),
    ).toEqual([]);
    expect(stepDownloads({ link: "/reports/x/y/z" })).toEqual([]);
    expect(stepDownloads(null)).toEqual([]);
  });
});
