import { describe, expect, test } from "vitest";
import { allowedActions } from "./actions-by-type";

describe("allowedActions", () => {
  test("onboarding grants: Grant / Enroll, Issue, Grant", () => {
    expect(
      allowedActions("onboarding", "app", ["Grant", "Modify", "Remove"]),
    ).toEqual(["Grant"]);
    expect(allowedActions("onboarding", "app", ["Enroll", "Remove"])).toEqual([
      "Enroll",
    ]);
    expect(
      allowedActions("onboarding", "equipment", ["Issue", "Return"]),
    ).toEqual(["Issue"]);
    expect(
      allowedActions("onboarding", "access", ["Grant", "Disable"]),
    ).toEqual(["Grant"]);
  });

  test("offboarding removes; access modification offers everything", () => {
    expect(
      allowedActions("offboarding", "access", [
        "Grant",
        "Modify",
        "Remove",
        "Disable",
      ]),
    ).toEqual(["Remove", "Disable"]);
    expect(
      allowedActions("access_modification", "app", [
        "Grant",
        "Modify",
        "Remove",
      ]),
    ).toEqual(["Grant", "Modify", "Remove"]);
  });

  test("an older row keeps showing its action until it is changed", () => {
    expect(
      allowedActions(
        "onboarding",
        "app",
        ["Grant", "Modify", "Remove"],
        "Remove",
      ),
    ).toEqual(["Grant", "Remove"]);
  });
});
