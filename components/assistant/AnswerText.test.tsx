import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AnswerText, answerBlocks, plainInline } from "./AnswerText";

describe("AnswerText", () => {
  test("paragraphs, bold, bullet and numbered lists", () => {
    const { container } = render(
      <AnswerText
        text={
          "**Returned** means it went back.\n\n- Read the comment\n- Fix it\n\n1. Open it\n2. Sign again"
        }
      />,
    );
    expect(screen.getByText("Returned").tagName).toBe("STRONG");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
  });

  test("a list right after a sentence, and a wrapped item (as in the live answer)", () => {
    expect(
      answerBlocks(
        "You can get it from the app yourself:\n- Go to **Reports → Onboarded by country**.\n- To split the US, use\n  Employees by office.\nSource: Help: Reports.",
      ),
    ).toEqual([
      { kind: "p", text: "You can get it from the app yourself:" },
      {
        kind: "ul",
        items: [
          "Go to **Reports → Onboarded by country**.",
          "To split the US, use Employees by office.",
        ],
      },
      { kind: "p", text: "Source: Help: Reports." },
    ]);
  });

  test("a table becomes one bullet per row (as in the live Slack answer)", () => {
    expect(
      answerBlocks(
        "Raju, two people hold Slack access today:\n\n| Name | Access detail | Since | Note |\n|---|---|---|---|\n| Test Ordinary user | Member | 12 Oct 2026 | Offboarding UAM-2026-000318 is open. |\n| marv tezt | Regular Member | 14 Oct 2026 | None |\n\nSource: Access by application, Slack.",
      ),
    ).toEqual([
      { kind: "p", text: "Raju, two people hold Slack access today:" },
      {
        kind: "ul",
        items: [
          "**Test Ordinary user**: Access detail: Member · Since: 12 Oct 2026 · Note: Offboarding UAM-2026-000318 is open.",
          "**marv tezt**: Access detail: Regular Member · Since: 14 Oct 2026",
        ],
      },
      { kind: "p", text: "Source: Access by application, Slack." },
    ]);
  });

  test("headings, links, code and half-written bold read as plain text", () => {
    expect(
      answerBlocks("## Open requests\nSee [the report](/reports/x)."),
    ).toEqual([
      { kind: "p", text: "**Open requests**" },
      { kind: "p", text: "See [the report](/reports/x)." },
    ]);
    expect(plainInline("See [the report](/reports/x) and `UAM-1`.")).toBe(
      "See the report and UAM-1.",
    );
    expect(plainInline("Two people, **Ana and")).toBe("Two people, Ana and");
    expect(plainInline("**Ana** is *new*.")).toBe("**Ana** is new.");
    expect(plainInline("rbh+approver@laine.ai and e2e_admin_x")).toBe(
      "rbh+approver@laine.ai and e2e_admin_x",
    );
  });

  test("never renders HTML from the answer", () => {
    const { container } = render(
      <AnswerText text={'<img src=x onerror="alert(1)"> <b>bold</b>'} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<img");
  });
});
