// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  helpAudiences,
  helpTopics,
  helpTopicsFor,
  parseHelpFile,
} from "./knowledge";

describe("the help library", () => {
  test("every page has a title, a summary, an audience and some text", () => {
    const topics = helpTopics();
    expect(topics.map((t) => t.id)).toEqual([
      "access-change",
      "admin",
      "assistant",
      "offboarding",
      "onboarding",
      "profile",
      "records",
      "reports",
      "signing",
      "statuses",
    ]);
    for (const t of topics) {
      expect(t.title.length).toBeGreaterThan(3);
      expect(t.summary.length).toBeGreaterThan(10);
      expect(t.text.length).toBeGreaterThan(100);
    }
  });

  test("who reads what: approvers the general pages, IT also how to fill requests, admins also Admin", () => {
    expect(helpAudiences(["approver"])).toEqual(["all"]);
    expect(helpAudiences(["auditor"])).toEqual(["all"]);
    expect(helpAudiences(["requester"])).toEqual(["all", "it"]);
    expect(helpAudiences(["admin"])).toEqual(["all", "it", "admin"]);
    expect(helpTopicsFor(["approver"]).map((t) => t.id)).not.toContain(
      "onboarding",
    );
  });

  test("a page without front matter or with an unknown audience is refused", () => {
    expect(() => parseHelpFile("x", "Just text")).toThrow(/front matter/);
    expect(() =>
      parseHelpFile(
        "x",
        "---\ntitle: X\naudience: everyone\nsummary: Y\n---\nText",
      ),
    ).toThrow(/audience/);
    expect(
      parseHelpFile(
        "x",
        "---\r\ntitle: X: Y\r\naudience: it\r\nsummary: S\r\n---\r\nBody",
      ),
    ).toEqual({
      id: "x",
      title: "X: Y",
      audience: "it",
      summary: "S",
      text: "Body",
    });
  });
});
