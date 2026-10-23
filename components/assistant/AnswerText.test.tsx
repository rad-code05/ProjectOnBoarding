import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AnswerText } from "./AnswerText";

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

  test("never renders HTML from the answer", () => {
    const { container } = render(
      <AnswerText text={'<img src=x onerror="alert(1)"> <b>bold</b>'} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<img");
  });
});
