import { describe, expect, test } from "vitest";
import type { FormOptions } from "@/lib/ai/tools/onboarding-shared";
import {
  checkOnboardingBatch,
  checkOnboardingRow,
  listItems,
  readDay,
  splitItem,
  toOnboardingInput,
  type BatchContext,
} from "./onboarding";

const options: FormOptions = {
  departments: [
    { id: 1, name: "Engineering" },
    { id: 2, name: "Sales" },
  ],
  offices: [
    { id: 1, name: "Dubai", country: "AE", usesRegions: false },
    { id: 4, name: "US", country: "US", usesRegions: true },
  ],
  regions: [{ id: 43, country: "US", name: "Texas" }],
  cities: [{ id: 9, officeId: 4, regionId: 43, name: "Austin" }],
  apps: [
    {
      id: 12,
      name: "Slack",
      actions: ["Grant", "Modify", "Remove"],
      permissions: ["Regular Member", "Workspace Owner"],
      multiple: false,
    },
    {
      id: 30,
      name: "Google Workspace",
      actions: ["Grant", "Remove"],
      permissions: ["User"],
      multiple: false,
    },
  ],
  equipment: [{ id: 2, name: "Laptop · macOS", actions: ["Issue", "Return"] }],
  access: [
    {
      id: 4,
      name: "Office access",
      actions: ["Grant", "Disable"],
      scopes: ["Badge", "Key"],
    },
  ],
};

const ctx: BatchContext = {
  options,
  today: "2026-10-29",
  openEmails: new Set(["sara.lopez@laine.ai"]),
};

const meera = {
  fullName: "Meera Nair",
  workEmail: "Meera.Nair@laine.ai",
  jobTitle: "Backend developer",
  department: "engineering",
  office: "Dubai",
  manager: "Omar Haddad",
  startDate: "02/11/2026",
  nationalities: "India",
  applications: "Slack (Regular Member), Google Workspace",
  equipment: "Laptop · macOS",
  physical: "Office access: Badge",
  requestedBy: "Rita Requestor",
};

describe("reading the cells", () => {
  test("list cells and their details", () => {
    expect(listItems("Slack · Regular Member, GitHub\nZoom")).toEqual([
      "Slack · Regular Member",
      "GitHub",
      "Zoom",
    ]);
    expect(splitItem("Slack (Regular Member)")).toEqual({
      name: "Slack",
      detail: "Regular Member",
    });
    expect(splitItem("Slack · Regular Member")).toEqual({
      name: "Slack",
      detail: "Regular Member",
    });
    expect(splitItem("Office access: Badge")).toEqual({
      name: "Office access",
      detail: "Badge",
    });
    expect(splitItem("Monday.com")).toEqual({ name: "Monday.com" });
  });

  test("days: ISO or day first; impossible dates are not dates", () => {
    expect(readDay("2026-11-02")).toBe("2026-11-02");
    expect(readDay("2/11/2026")).toBe("2026-11-02");
    expect(readDay("02.11.2026")).toBe("2026-11-02");
    expect(readDay("31/02/2026")).toBeNull();
    expect(readDay("next Monday")).toBeNull();
  });

  test("a full name splits into first and last name", () => {
    expect(toOnboardingInput({ fullName: "Mary Ann van Berg" })).toMatchObject({
      firstName: "Mary Ann van",
      lastName: "Berg",
    });
  });
});

describe("one row", () => {
  test("a complete row: no problems, the draft's values", () => {
    const r = checkOnboardingRow(meera, ctx);
    expect(r.problems).toEqual([]);
    expect(r.writes).toEqual(
      expect.arrayContaining([
        {
          kind: "field",
          target: "first_name",
          value: "Meera",
          reason: undefined,
        },
        {
          kind: "field",
          target: "work_email",
          value: "meera.nair@laine.ai",
          reason: undefined,
        },
        { kind: "field", target: "department_id", value: 1, reason: undefined },
        {
          kind: "field",
          target: "effective_date",
          value: "2026-11-02",
          reason: undefined,
        },
        {
          kind: "field",
          target: "nationalities",
          value: ["IN"],
          reason: undefined,
        },
        {
          kind: "access",
          target: "app:12",
          value: { action: "Grant", permission: "Regular Member" },
          reason: undefined,
        },
        {
          kind: "access",
          target: "app:30",
          value: { action: "Grant", permission: "User" },
          reason: undefined,
        },
        {
          kind: "equipment",
          target: "equipment:2",
          value: { action: "Issue", description: null },
          reason: undefined,
        },
        { kind: "field", target: "requestor_name", value: "Rita Requestor" },
      ]),
    );
  });

  test("each problem names its cell", () => {
    const r = checkOnboardingRow(
      {
        ...meera,
        department: "Engeneering",
        startDate: "2026-10-20",
        applications: "Slack",
        manager: "",
      },
      ctx,
    );
    expect(r.problems.map((p) => p.field)).toEqual([
      "manager",
      "startDate",
      "department",
      "applications",
    ]);
    expect(r.problems[0].message).toBe("Manager missing — required");
    expect(r.problems[1].message).toBe(
      "In the past — dates are never backdated",
    );
    expect(r.problems[2].message).toMatch(
      /There is no department "Engeneering"/,
    );
    expect(r.problems[3].message).toMatch(/Which Slack role\?/);
  });

  test("not a date; an email with an open request", () => {
    const r = checkOnboardingRow(
      { ...meera, startDate: "soon", workEmail: "sara.lopez@laine.ai" },
      ctx,
    );
    expect(r.problems).toEqual([
      {
        field: "startDate",
        message:
          '"soon" isn\'t a date — write it like 2026-11-02 or 02/11/2026',
      },
      {
        field: "workEmail",
        message: "sara.lopez@laine.ai already has an open request",
      },
    ]);
  });
});

describe("the whole batch", () => {
  test("the same work email twice: the later row is flagged", () => {
    const rows = checkOnboardingBatch(
      [
        { position: 2, values: { ...meera, fullName: "Meera Again" } },
        { position: 1, values: meera },
      ],
      ctx,
    );
    expect(rows.get(1)?.problems).toEqual([]);
    expect(rows.get(2)?.problems).toEqual([
      { field: "workEmail", message: "The same work email as row 1" },
    ]);
  });
});
