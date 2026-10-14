import { describe, expect, test } from "vitest";
import { approvalErrorMessage } from "./decide";

describe("approvalErrorMessage", () => {
  test("the request changed after the IT side signed it (F10d-1)", () => {
    expect(
      approvalErrorMessage(
        "23514",
        "the request changed after it was signed for IT — return it so it can be signed again",
      ),
    ).toBe(
      "This request changed after the IT side signed it. Return it so it can be reviewed and signed again.",
    );
  });

  test("other refusals keep their words", () => {
    expect(approvalErrorMessage("40001", undefined)).toMatch(
      /changed while you were reviewing it/,
    );
    expect(
      approvalErrorMessage("42501", "nobody confirms their own request"),
    ).toBe("You prepared this request — another approver must confirm it.");
    expect(approvalErrorMessage("XX000", "boom")).toBe(
      "Could not save. Check your connection and try again.",
    );
  });
});
