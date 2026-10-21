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
          key: "department",
          label: "Department / team",
          field_type: "department",
        })}
        value="3"
        choices={[{ value: "3", label: "Sales" }]}
      />,
    );
    const select = screen.getByLabelText("Department / team");
    expect(select).toHaveValue("3");
    expect(screen.getByRole("option", { name: "Choose…" })).toBeInTheDocument();
  });

  test("country, office, state and city are searchable drop-downs (F27)", async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FieldRenderer
        field={field({
          key: "country",
          label: "Country",
          field_type: "country",
        })}
        value="CH"
        onChange={onChange}
        choices={[
          { value: "CH", label: "Switzerland" },
          { value: "SE", label: "Sweden" },
          { value: "AE", label: "United Arab Emirates" },
        ]}
      />,
    );
    const box = screen.getByRole("combobox", { name: "Country" });
    expect(box).toHaveValue("Switzerland");
    await u.click(box);
    await u.type(box, "emir");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "United Arab Emirates",
    ]);
    await u.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("AE");
  });

  test("nationality: up to two, each removable", async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    const choices = [
      { value: "CH", label: "Switzerland" },
      { value: "IT", label: "Italy" },
      { value: "FR", label: "France" },
    ];
    const nat = field({
      key: "nationalities",
      label: "Nationality",
      field_type: "nationality",
    });
    const { rerender } = render(
      <FieldRenderer
        field={nat}
        value="CH"
        onChange={onChange}
        choices={choices}
      />,
    );
    await u.click(screen.getByRole("combobox", { name: "Nationality" }));
    expect(
      screen.queryByRole("option", { name: "Switzerland" }),
    ).not.toBeInTheDocument();
    await u.click(screen.getByRole("option", { name: "Italy" }));
    expect(onChange).toHaveBeenCalledWith("CH,IT");

    rerender(
      <FieldRenderer
        field={nat}
        value="CH,IT"
        onChange={onChange}
        choices={choices}
      />,
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      screen.getByText("Two chosen — remove one to change."),
    ).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Remove Switzerland" }));
    expect(onChange).toHaveBeenLastCalledWith("IT");
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
