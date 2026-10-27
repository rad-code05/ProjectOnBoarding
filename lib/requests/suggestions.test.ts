import { describe, expect, test } from "vitest";
import { buildSuggestions, type SuggestionNames } from "./suggestions";

const labels: Record<string, Record<string, string>> = {
  department: { "3": "Engineering" },
  office: { "1": "Dubai" },
};
const names: SuggestionNames = {
  choice: (key, value) => labels[key]?.[value],
  apps: new Map([[12, "Slack"]]),
  equipment: new Map([[2, "Laptop"]]),
  physical: new Map([[4, "Office access"]]),
  companyTimeZone: "Asia/Dubai",
};

const row = (kind: string, target: string, value: unknown, reason = null) => ({
  id: `${kind}-${target}`,
  kind,
  target,
  value,
  reason,
});

describe("buildSuggestions", () => {
  test("fields: column values become form strings, with the words people read", () => {
    const s = buildSuggestions(
      [
        row("field", "manager_name", "Omar Haddad"),
        row("field", "department_id", 3),
        row("field", "office_id", 1),
        row("field", "nationalities", ["IN", "GB"]),
        row("field", "country", "AE"),
        row("field", "effective_date", "2026-10-26"),
      ],
      names,
    );
    expect(s.total).toBe(6);
    expect(s.fields.map((f) => [f.key, f.patch, f.shown])).toEqual([
      ["manager_name", { manager_name: "Omar Haddad" }, "Omar Haddad"],
      ["department", { department: "3" }, "Engineering"],
      ["office", { office: "1" }, "Dubai"],
      ["nationalities", { nationalities: "IN,GB" }, "India, United Kingdom"],
      ["country", { country: "AE" }, "United Arab Emirates"],
      ["effective_date", { effective_date: "2026-10-26" }, "26 Oct 2026"],
    ]);
  });

  test("the cut-off moment fills date and time in the company timezone", () => {
    const [f] = buildSuggestions(
      [row("field", "access_cutoff_at", "2026-10-30T19:59:00Z")],
      names,
    ).fields;
    expect(f.key).toBe("cutoff_date");
    expect(f.patch).toEqual({
      cutoff_date: "2026-10-30",
      cutoff_time: "23:59",
    });
    expect(f.shown).toBe("30 Oct 2026, 23:59");
  });

  test("a change to something they hold, by its name (access change)", () => {
    const s = buildSuggestions(
      [
        row("held", "held:inv-1", {
          action: "Modify",
          value: "Workspace Owner",
        }),
      ],
      { ...names, held: new Map([["inv-1", "Slack"]]) },
    );
    expect(s.items).toEqual([
      {
        id: "held-held:inv-1",
        kind: "held",
        name: "Slack",
        detail: "Modify · Workspace Owner",
        reason: null,
      },
    ]);
  });

  test("items: catalog names and what they'd do", () => {
    const s = buildSuggestions(
      [
        row("access", "app:12", {
          action: "Grant",
          permission: "Regular Member",
        }),
        row("equipment", "equipment:2", { action: "Issue" }),
        row("physical", "access:4", { action: "Grant", scope: "Badge" }),
        row("other", "x", {}),
      ],
      names,
    );
    expect(s.items.map((i) => [i.kind, i.name, i.detail])).toEqual([
      ["access", "Slack", "Grant · Regular Member"],
      ["equipment", "Laptop", "Issue"],
      ["physical", "Office access", "Grant · Badge"],
    ]);
    expect(s.total).toBe(3);
  });
  test("section 9: a draft of the implementation notes (F16e-1)", () => {
    const s = buildSuggestions(
      [row("execution_notes", "execution_notes", "Invite sent.")],
      names,
    );
    expect(s.items).toEqual([
      expect.objectContaining({
        kind: "execution_notes",
        name: "Implementation notes",
        detail: "Invite sent.",
      }),
    ]);
  });
});
