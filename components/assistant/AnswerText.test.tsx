import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AnswerText, answerBlocks } from "./AnswerText";

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

  test("never renders HTML from the answer", () => {
    const { container } = render(
      <AnswerText text={'<img src=x onerror="alert(1)"> <b>bold</b>'} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<img");
  });
});
