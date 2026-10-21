import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { Combobox, filterOptions, foldText } from "./Combobox";

const states = [
  { value: "1", label: "New Mexico" },
  { value: "2", label: "New York" },
  { value: "3", label: "Texas" },
];

describe("matching", () => {
  test("letters anywhere, any case, accents ignored", () => {
    expect(filterOptions(states, "york").map((o) => o.label)).toEqual([
      "New York",
    ]);
    expect(filterOptions(states, "NEW").map((o) => o.label)).toEqual([
      "New Mexico",
      "New York",
    ]);
    expect(foldText("  Zürich ")).toBe("zurich");
    expect(filterOptions(states, "")).toHaveLength(3);
  });
});

describe("Combobox", () => {
  test("shows the chosen name; typing narrows; keys move and pick", async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Combobox
        ariaLabel="State"
        value="3"
        onChange={onChange}
        options={states}
      />,
    );
    const box = screen.getByRole("combobox", { name: "State" });
    expect(box).toHaveValue("Texas");
    expect(box).toHaveAttribute("aria-expanded", "false");
    await u.click(box);
    expect(box).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await u.type(box, "new");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    await u.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("2");
    expect(box).toHaveAttribute("aria-expanded", "false");
  });

  test("Escape closes without changing; a click picks", async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Combobox
        ariaLabel="State"
        value=""
        onChange={onChange}
        options={states}
      />,
    );
    const box = screen.getByRole("combobox", { name: "State" });
    await u.click(box);
    await u.type(box, "tex");
    await u.keyboard("{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    expect(box).toHaveValue("");
    await u.click(box);
    await u.click(screen.getByRole("option", { name: "New Mexico" }));
    expect(onChange).toHaveBeenCalledWith("1");
  });

  test("no match: says so, and can offer to add what was typed", async () => {
    const u = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <Combobox
        ariaLabel="City"
        value=""
        onChange={vi.fn()}
        options={[{ value: "7", label: "Austin" }]}
        noMatch={(q) => `No city in Texas matches “${q}”`}
        create={{ label: (q) => `Add “${q}” to Texas`, onCreate }}
      />,
    );
    const box = screen.getByRole("combobox", { name: "City" });
    await u.click(box);
    await u.type(box, "Dallas");
    expect(
      screen.getByText("No city in Texas matches “Dallas”"),
    ).toBeInTheDocument();
    await u.click(
      screen.getByRole("option", { name: /Add “Dallas” to Texas/ }),
    );
    expect(onCreate).toHaveBeenCalledWith("Dallas");
  });

  test("an optional field can be cleared", async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Combobox
        ariaLabel="State"
        value="3"
        onChange={onChange}
        options={states}
      />,
    );
    await u.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
