import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { FormField } from "@/lib/requests/fields";
import { FieldRenderer, phoneSpan } from "./FieldRenderer";

const field = (overrides: Partial<FormField>): FormField => ({
  key: "job_title",
  label: "Job title / role",
  section: 2,
  field_type: "text",
  required: true,
  help_text: null,
  ...overrides,
});

describe("FieldRenderer", () => {
  test("text field: labelled input that reports changes", async () => {
    const onChange = vi.fn();
    render(<FieldRenderer field={field({})} value="" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Job title / role"), "D");
    expect(onChange).toHaveBeenCalledWith("D");
  });

  test("email and date fields use the matching input type", () => {
    render(
      <>
        <FieldRenderer
          field={field({
            key: "work_email",
            label: "Work email",
            field_type: "email",
          })}
          value=""
        />
        <FieldRenderer
          field={field({
            key: "effective_date",
            label: "Effective date",
            field_type: "date",
          })}
          value=""
        />
      </>,
    );
    expect(screen.getByLabelText("Work email")).toHaveAttribute(
      "type",
      "email",
    );
    expect(screen.getByLabelText("Effective date")).toHaveAttribute(
      "type",
      "date",
    );
  });

  test("list fields offer their choices plus an empty choice", () => {
    render(
      <FieldRenderer
        field={field({
          key: "country",
          label: "Country",
          field_type: "country",
        })}
        value="CH"
        choices={[{ value: "CH", label: "Switzerland" }]}
      />,
    );
    const select = screen.getByLabelText("Country");
    expect(select).toHaveValue("CH");
    expect(screen.getByRole("option", { name: "Choose…" })).toBeInTheDocument();
  });

  test("system fields are shown, not editable", () => {
    render(
      <FieldRenderer
        field={field({
          key: "ticket_id",
          label: "Ticket ID",
          field_type: "system",
        })}
        value="UAM-2026-000124"
      />,
    );
    expect(screen.getByRole("group", { name: "Ticket ID" })).toHaveTextContent(
      "UAM-2026-000124",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  test("an error marks the field invalid and is linked to it", () => {
    render(
      <FieldRenderer
        field={field({
          key: "work_email",
          label: "Work email",
          field_type: "email",
          help_text: "Identifies the person.",
        })}
        value="x"
        error="Enter a valid email address."
      />,
    );
    const input = screen.getByLabelText("Work email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "Enter a valid email address. Identifies the person.",
    );
  });
});

describe("phoneSpan", () => {
  test("text takes the full phone width, names and lists pair up", () => {
    expect(phoneSpan(field({}))).toContain("col-span-2");
    expect(phoneSpan(field({ key: "first_name" }))).toBe("col-span-1");
    expect(phoneSpan(field({ field_type: "country" }))).toBe("col-span-1");
  });
});
