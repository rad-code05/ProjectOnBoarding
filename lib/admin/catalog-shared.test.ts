import { describe, expect, test } from "vitest";
import {
  catalogErrorMessage,
  filterApps,
  optionsLine,
  type AdminApp,
  type AdminCategory,
} from "./catalog-shared";

const categories: AdminCategory[] = [
  { id: 1, name: "Core business", active: true },
  { id: 2, name: "Engineering, cloud & data", active: true },
];
const app = (
  id: number,
  name: string,
  categoryId: number,
  active = true,
): AdminApp => ({
  id,
  name,
  categoryId,
  actions: ["Grant", "Modify", "Remove"],
  permissions: ["User", "Admin"],
  active,
  uses: 0,
});
const apps = [
  app(1, "Slack", 1),
  app(2, "Google Workspace", 1),
  app(3, "GitHub", 2),
  app(4, "Trello", 1, false),
];
const names = (groups: ReturnType<typeof filterApps>) =>
  groups.map((g) => [g.category.name, g.apps.map((a) => a.name)]);

describe("filterApps", () => {
  test("All shows the active apps grouped by category", () => {
    expect(names(filterApps(categories, apps, "", "all"))).toEqual([
      ["Core business", ["Slack", "Google Workspace"]],
      ["Engineering, cloud & data", ["GitHub"]],
    ]);
  });
  test("a category chip shows only that category", () => {
    expect(names(filterApps(categories, apps, "", 2))).toEqual([
      ["Engineering, cloud & data", ["GitHub"]],
    ]);
  });
  test("Retired shows only the retired apps", () => {
    expect(names(filterApps(categories, apps, "", "retired"))).toEqual([
      ["Core business", ["Trello"]],
    ]);
  });
  test("search needs every word, ignoring case", () => {
    expect(names(filterApps(categories, apps, "google WORK", "all"))).toEqual([
      ["Core business", ["Google Workspace"]],
    ]);
    expect(filterApps(categories, apps, "zoom", "all")).toEqual([]);
  });
});

describe("optionsLine", () => {
  test("actions, then permissions", () => {
    expect(optionsLine(apps[0])).toBe("Grant · Modify · Remove — User / Admin");
  });
});

describe("catalogErrorMessage", () => {
  test.each([
    [
      "42501",
      "only an admin changes the lists",
      "Only an admin changes the lists.",
    ],
    [
      "23505",
      "an application called Notion already exists",
      "An application called Notion already exists.",
    ],
    ["23514", "choose at least one action", "Choose at least one action."],
    ["XX000", "boom", "Could not save. Reload and try again."],
  ])("%s → %s", (code, message, expected) => {
    expect(catalogErrorMessage(code, message)).toBe(expected);
  });
});
