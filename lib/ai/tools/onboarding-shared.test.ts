import { describe, expect, test } from "vitest";
import {
  countryCode,
  missingTopics,
  precheckOnboarding,
  resolveOnboarding,
  type FormOptions,
} from "./onboarding-shared";

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
      id: 20,
      name: "Google Cloud",
      actions: ["Grant", "Remove"],
      permissions: ["Viewer", "Editor", "Owner"],
      multiple: true,
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

describe("countryCode", () => {
  test("names, codes and nationality words", () => {
    expect(countryCode("India")).toBe("IN");
    expect(countryCode("in")).toBe("IN");
    expect(countryCode("Indian")).toBe("IN");
    expect(countryCode("Swiss")).toBeNull(); // asked, never guessed
  });
});

describe("resolveOnboarding", () => {
  test("names become the database's ids, each value a suggestion with its reason", () => {
    const r = resolveOnboarding(
      {
        firstName: " Meera ",
        lastName: "Nair",
        workEmail: "Meera.Nair@laine.ai",
        department: "engineering",
        office: "Dubai",
        manager: "Omar Haddad",
        startDate: "2026-10-26",
        nationalities: ["Indian"],
        applications: [
          {
            name: "slack",
            permission: "regular member",
            reason: "you said so",
          },
          { name: "Google Cloud", permission: "Viewer; Editor" },
        ],
        equipment: [{ type: "Laptop · macOS" }],
        access: [{ type: "Office access", scope: "badge" }],
        reasons: { startDate: "“Monday”" },
      },
      options,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestions).toEqual([
      { kind: "field", target: "first_name", value: "Meera" },
      { kind: "field", target: "last_name", value: "Nair" },
      { kind: "field", target: "work_email", value: "meera.nair@laine.ai" },
      { kind: "field", target: "manager_name", value: "Omar Haddad" },
      {
        kind: "field",
        target: "effective_date",
        value: "2026-10-26",
        reason: "“Monday”",
      },
      { kind: "field", target: "department_id", value: 1 },
      { kind: "field", target: "office_id", value: 1 },
      { kind: "field", target: "country", value: "AE" },
      { kind: "field", target: "nationalities", value: ["IN"] },
      {
        kind: "access",
        target: "app:12",
        value: { action: "Grant", permission: "Regular Member" },
        reason: "you said so",
      },
      {
        kind: "access",
        target: "app:20",
        value: { action: "Grant", permission: "Viewer; Editor" },
      },
      {
        kind: "equipment",
        target: "equipment:2",
        value: { action: "Issue", description: null },
      },
      {
        kind: "physical",
        target: "access:4",
        value: { action: "Grant", scope: "Badge" },
      },
    ]);
  });

  test("US: state, then a city added for that state", () => {
    const r = resolveOnboarding(
      {
        firstName: "Emily",
        lastName: "Carter",
        office: "US",
        state: "Texas",
        city: "austin",
      },
      options,
    );
    expect(r.ok && r.suggestions.map((s) => [s.target, s.value])).toEqual([
      ["first_name", "Emily"],
      ["last_name", "Carter"],
      ["office_id", 4],
      ["country", "US"],
      ["region_id", 43],
      ["office_city_id", 9],
    ]);
  });

  test("nothing is guessed: unknown names come back as problems with what exists", () => {
    const r = resolveOnboarding(
      {
        firstName: "Meera",
        lastName: "Nair",
        workEmail: "meera@",
        department: "R&D",
        office: "Bangalore",
        startDate: "Monday",
        nationalities: ["Swiss"],
        applications: [
          { name: "Notion" },
          { name: "Slack" },
          { name: "Slack", permission: "Regular Member; Workspace Owner" },
        ],
        equipment: [{ type: "Tablet" }],
        access: [{ type: "Office access", scope: "Fingerprint" }],
      },
      options,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems).toEqual([
      '"meera@" isn\'t a valid email address.',
      "The start date must be a day like 2026-10-26.",
      'There is no department "R&D". Departments: Engineering, Sales.',
      'There is no office "Bangalore". Offices: Dubai, US.',
      'Nationality "Swiss": write the country, e.g. India or Switzerland.',
      '"Notion" isn\'t in the catalog. Applications: Slack, Google Cloud. (An admin can add it in Admin → Applications.)',
      "Which Slack role? Regular Member, Workspace Owner.",
      'Slack has no role "Regular Member; Workspace Owner". Roles: Regular Member, Workspace Owner.',
      'There is no equipment type "Tablet". Types: Laptop · macOS.',
      'Office access has no scope "Fingerprint". Scopes: Badge, Key.',
    ]);
  });
});

describe("nothing missed before the Confirm (Raju, 2026-10-26)", () => {
  const complete = {
    firstName: "Meera",
    lastName: "Nair",
    workEmail: "meera.nair@laine.ai",
    jobTitle: "Backend developer",
    department: "Engineering",
    office: "Dubai",
    manager: "Omar Haddad",
    startDate: "2026-11-02",
    applications: [{ name: "Slack", permission: "Regular Member" }],
    equipment: [{ type: "Laptop · macOS" }],
    access: [{ type: "Office access", scope: "Badge" }],
    nationalities: ["India"],
  };

  test("a quick draft (name, office, one app) leaves topics open", () => {
    expect(
      missingTopics({
        firstName: "Meera",
        lastName: "Test",
        office: "Dubai",
        applications: [{ name: "Slack" }],
      }),
    ).toEqual([
      "workEmail",
      "jobTitle",
      "department",
      "manager",
      "startDate",
      "equipment",
      "access",
      "nationalities",
    ]);
  });

  test("a topic the person said isn't needed is closed — never the office", () => {
    const { equipment, access, nationalities, office, ...rest } = complete;
    void equipment;
    void access;
    void nationalities;
    void office;
    expect(
      missingTopics({
        ...rest,
        notNeeded: ["equipment", "access", "nationalities", "office"],
      }),
    ).toEqual(["office"]);
    expect(missingTopics(complete)).toEqual([]);
  });

  test("precheck: what to ask, then unknown names, then nothing (shows the card)", () => {
    expect(
      precheckOnboarding(
        { firstName: "Meera", lastName: "Test", office: "Dubai" },
        options,
      ),
    ).toContain(
      "Ask about: work email, job title, department, manager, start date, applications and their roles, equipment",
    );
    expect(
      precheckOnboarding({ ...complete, office: "Mumbai" }, options),
    ).toContain('There is no office "Mumbai"');
    expect(precheckOnboarding(complete, options)).toBeNull();
  });
});
