import { describe, expect, test } from "vitest";
import type { FormField } from "./fields";
import {
  NO_OFFICE,
  WORKER_TYPE_CHOICES,
  fieldFor,
  officeChoicesFor,
  workerTypeLabel,
} from "./worker-type";

const field = (key: string, overrides: Partial<FormField> = {}): FormField => ({
  key,
  label: key,
  section: 2,
  field_type: "text",
  required: true,
  help_text: "Original help.",
  ...overrides,
});

const offices = [
  { value: "1", label: "Dubai" },
  { value: "4", label: "US" },
];

describe("worker type (F24f)", () => {
  test("two choices, Employee first", () => {
    expect(WORKER_TYPE_CHOICES).toEqual([
      { value: "employee", label: "Employee" },
      { value: "contractor", label: "Contractor" },
    ]);
  });

  test("labels; nothing chosen = empty", () => {
    expect(workerTypeLabel("employee")).toBe("Employee");
    expect(workerTypeLabel("contractor")).toBe("Contractor");
    expect(workerTypeLabel(null)).toBe("");
    expect(workerTypeLabel("")).toBe("");
  });

  test("an employee's (or undecided) office stays required, as it was", () => {
    const office = field("office");
    expect(fieldFor(office, "employee", "")).toBe(office);
    expect(fieldFor(office, "", "")).toBe(office);
  });

  test("a contractor's office is optional and says so", () => {
    const office = fieldFor(field("office"), "contractor", "");
    expect(office.required).toBe(false);
    expect(office.help_text).toMatch(/may have no office/);
  });

  test("a contractor with no office is asked where they work", () => {
    expect(fieldFor(field("country"), "contractor", "").help_text).toBe(
      "With no office, pick the country they work from.",
    );
    expect(fieldFor(field("country"), "contractor", "1").help_text).toBe(
      "Original help.",
    );
    expect(fieldFor(field("country"), "employee", "").help_text).toBe(
      "Original help.",
    );
  });

  test('"No office" is offered to contractors only', () => {
    expect(officeChoicesFor(offices, "contractor")).toEqual([
      { value: "", label: NO_OFFICE },
      ...offices,
    ]);
    expect(officeChoicesFor(offices, "employee")).toBe(offices);
    expect(officeChoicesFor(offices, "")).toBe(offices);
  });
});
