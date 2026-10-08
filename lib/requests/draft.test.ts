import { describe, expect, test } from "vitest";
import { COUNTRY_CODES, countryOptions } from "./countries";
import {
  draftValuesSchema,
  fieldErrorsOf,
  saveDraftSchema,
  toColumns,
  type DraftFormValues,
} from "./draft";

const empty: DraftFormValues = {
  type: "onboarding",
  priority: "medium",
  assignee: "",
  first_name: "",
  last_name: "",
  work_email: "",
  job_title: "",
  department: "",
  country: "",
  manager_name: "",
  requestor_name: "",
  effective_date: "",
};

describe("draftValuesSchema", () => {
  test("an empty draft is valid and saves as empty (null) columns", () => {
    const result = draftValuesSchema.parse(empty);
    expect(toColumns(result)).toMatchObject({
      first_name: null,
      work_email: null,
      department_id: null,
      country: null,
      effective_date: null,
    });
  });

  test("trims text, lower-cases the email and maps keys to columns", () => {
    const result = draftValuesSchema.parse({
      ...empty,
      first_name: "  Anna ",
      work_email: " Anna.Keller@Laine.AI ",
      department: "2",
      country: "CH",
      assignee: "user_123",
      effective_date: "2026-10-14",
    });
    expect(toColumns(result)).toMatchObject({
      first_name: "Anna",
      work_email: "anna.keller@laine.ai",
      department_id: 2,
      country: "CH",
      assignee_id: "user_123",
      effective_date: "2026-10-14",
    });
  });

  test("filled-in values must be valid — one message per field", () => {
    const result = draftValuesSchema.safeParse({
      ...empty,
      work_email: "not-an-email",
      country: "XX",
      effective_date: "14.10.2026",
      department: "Tech",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrorsOf(result.error)).toEqual({
      work_email: "Enter a valid email address, e.g. anna.keller@laine.ai.",
      country: "Choose a country from the list.",
      effective_date: "Enter a date.",
      department: "Choose a department from the list.",
    });
  });

  test("ticket type and priority only accept known values", () => {
    expect(
      draftValuesSchema.safeParse({ ...empty, type: "promotion" }).success,
    ).toBe(false);
    expect(
      draftValuesSchema.safeParse({ ...empty, priority: "urgent" }).success,
    ).toBe(false);
  });
});

describe("saveDraftSchema", () => {
  test("needs a request ID and the version the form was loaded with", () => {
    const id = "0b8f6a3e-5d2c-4f1a-9e7b-2c3d4e5f6a7b";
    expect(saveDraftSchema.safeParse({ id, version: 3 }).success).toBe(true);
    expect(saveDraftSchema.safeParse({ id, version: 0 }).success).toBe(false);
    expect(
      saveDraftSchema.safeParse({ id: "../admin", version: 1 }).success,
    ).toBe(false);
  });
});

describe("countries", () => {
  test("all 249 ISO codes, shown by name in alphabetical order", () => {
    expect(new Set(COUNTRY_CODES).size).toBe(249);
    const options = countryOptions();
    expect(options.find((o) => o.value === "CH")?.label).toBe("Switzerland");
    const labels = options.map((o) => o.label);
    expect(labels).toEqual(
      [...labels].sort((a, b) => a.localeCompare(b, "en")),
    );
  });
});
