import { describe, expect, test } from "vitest";
import { isSettled, labelFor } from "./execution";

const row = {
  key: "access_provisioned",
  label: "All authorised access provisioned or modified",
  type_labels: {
    onboarding: "All authorised access provisioned",
    access_modification: "All authorised access modified",
  },
};

describe("section 9 labels and answers (2026-10-14)", () => {
  test("each type gets its own label, else the item's label", () => {
    expect(labelFor(row, "onboarding").label).toBe(
      "All authorised access provisioned",
    );
    expect(labelFor(row, "access_modification").label).toBe(
      "All authorised access modified",
    );
    expect(labelFor({ ...row, type_labels: {} }, "onboarding").label).toBe(
      "All authorised access provisioned or modified",
    );
  });

  test("done, not needed and no changes made are settled", () => {
    expect(
      [true, "not_needed", "no_change", false].map((v) =>
        isSettled(v as never),
      ),
    ).toEqual([true, true, true, false]);
  });
});
