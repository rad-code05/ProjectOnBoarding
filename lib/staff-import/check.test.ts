import { describe, expect, test, vi } from "vitest";
import type { FormOptions } from "@/lib/ai/tools/onboarding-shared";
import { withAppColumns } from "@/lib/requests/batch/onboarding";
import { checkImport, checkImportRow, type ImportContext } from "./check";
import { importTemplateColumns, matchImportColumns } from "./columns";
import { readImportFile } from "./read";
import { storageName } from "./store";

vi.mock("server-only", () => ({}));

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
      id: 15,
      name: "Google Cloud",
      actions: ["Grant", "Modify", "Remove"],
      permissions: ["Viewer", "Editor", "Owner"],
      multiple: true,
    },
  ],
  equipment: [],
  access: [],
};

const ctx: ImportContext = {
  options,
  today: "2026-11-05",
  inApp: new Map([["rose.bernal@laine.ai", "UAM-2026-000014"]]),
};

const lucas = {
  firstName: "Lucas",
  lastName: "Moreau",
  workEmail: "Lucas.Moreau@laine.ai",
  jobTitle: "Backend developer",
  department: "engineering",
  office: "Dubai",
  nationalities: "France",
  manager: "Omar Haddad",
  startDate: "06/01/2025",
  applications: "Slack (Regular Member), Google Cloud (Viewer; Editor)",
  otherApplications: "Notion (Member)",
};

describe("checkImportRow", () => {
  test("a person who joined before the app: past start date, ids, access", () => {
    const r = checkImportRow(lucas, ctx);
    expect(r.problems).toEqual([]);
    expect(r.skipped).toBeNull();
    expect(r.person).toEqual({
      first_name: "Lucas",
      last_name: "Moreau",
      work_email: "lucas.moreau@laine.ai",
      job_title: "Backend developer",
      manager_name: "Omar Haddad",
      department_id: 1,
      office_id: 1,
      country: "AE",
      nationalities: ["FR"],
      start_date: "2025-01-06",
      access: [
        { app_id: 12, permission: "Regular Member" },
        { app_id: 15, permission: "Viewer; Editor" },
        { name: "Notion", permission: "Member" },
      ],
    });
  });

  test("a leaver: the leave date from the file", () => {
    const r = checkImportRow({ ...lucas, leaveDate: "2026-02-28" }, ctx);
    expect(r.problems).toEqual([]);
    expect(r.person.leave_date).toBe("2026-02-28");
  });

  test("dates: never in the future, leave after start, real days", () => {
    expect(
      checkImportRow({ ...lucas, startDate: "2026-12-01" }, ctx).problems,
    ).toEqual([
      {
        field: "startDate",
        message: "In the future — use a normal onboarding for new joiners",
      },
    ]);
    expect(
      checkImportRow({ ...lucas, leaveDate: "2024-12-31" }, ctx).problems,
    ).toEqual([
      { field: "leaveDate", message: "Before the start date (2025-01-06)" },
    ]);
    expect(
      checkImportRow({ ...lucas, leaveDate: "2027-01-01" }, ctx).problems[0]
        ?.field,
    ).toBe("leaveDate");
    expect(
      checkImportRow({ ...lucas, startDate: "31/02/2025" }, ctx).problems[0],
    ).toMatchObject({ field: "startDate" });
  });

  test("required fields, unknown names and roles name their cell", () => {
    const r = checkImportRow(
      {
        firstName: "Nadia",
        workEmail: "nadia@laine.ai",
        department: "Product",
        office: "Dubai",
        startDate: "2025-03-03",
        applications: "Slack (Full seat)",
      },
      ctx,
    );
    expect(r.problems.map((p) => p.field)).toEqual([
      "lastName",
      "department",
      "applications",
    ]);
    // What did resolve is still there for the grid.
    expect(r.person.office_id).toBe(1);
  });

  test("someone already in the app is skipped, not imported", () => {
    const r = checkImportRow(
      { ...lucas, workEmail: "Rose.Bernal@laine.ai" },
      ctx,
    );
    expect(r.skipped).toBe("Already in the app: UAM-2026-000014");
  });
});

describe("checkImport", () => {
  test("the same work email twice: the later row is flagged", () => {
    const out = checkImport(
      [
        { position: 1, values: lucas },
        { position: 2, values: { ...lucas, firstName: "Luc" } },
      ],
      ctx,
    );
    expect(out.get(1)?.problems).toEqual([]);
    expect(out.get(2)?.problems).toEqual([
      { field: "workEmail", message: "The same work email as row 1" },
    ]);
  });
});

describe("the import file", () => {
  test("the template: the person's columns, then one per application", () => {
    expect(importTemplateColumns(["Slack", "GitHub"])).toEqual([
      "First name",
      "Last name",
      "Work email",
      "Job title",
      "Department",
      "Office",
      "State",
      "City",
      "Nationality",
      "Manager",
      "Start date",
      "Leave date",
      "Other applications",
      "Slack",
      "GitHub",
    ]);
  });

  test("people's own titles are understood", () => {
    const m = matchImportColumns([
      "User Name",
      "Emails",
      "Positions",
      "Removal Date",
      "Slack",
    ]);
    expect(m.map((c) => c.field)).toEqual([
      "fullName",
      "workEmail",
      "jobTitle",
      "leaveDate",
      null,
    ]);
  });

  test("a .csv with application columns → records with the roles joined", async () => {
    const csv = [
      "First name,Last name,Work email,Department,Office,Start date,Slack,Google Cloud",
      'Lucas,Moreau,lucas.moreau@laine.ai,Engineering,Dubai,2025-01-06,Regular Member,"Viewer, Editor"',
    ].join("\n");
    const [record] = await readImportFile(
      "staff.csv",
      new TextEncoder().encode(csv),
    );
    const joined = withAppColumns(record!, options.apps);
    expect(joined.values.applications).toBe(
      "Slack (Regular Member), Google Cloud (Viewer; Editor)",
    );
    expect(checkImportRow(joined.values, ctx).problems).toEqual([]);
  });

  test("more than 500 people is refused", async () => {
    const rows = ["First name,Work email"];
    for (let i = 0; i < 501; i++) rows.push(`P${i},p${i}@laine.ai`);
    await expect(
      readImportFile("big.csv", new TextEncoder().encode(rows.join("\n"))),
    ).rejects.toThrow("an import takes up to 500");
  });

  test("other file types are refused", async () => {
    await expect(
      readImportFile("staff.pdf", new Uint8Array([1, 2, 3])),
    ).rejects.toThrow("Upload an .xlsx or a .csv file.");
  });

  test("a storage-safe file name", () => {
    expect(storageName("Laine staff (reviewed) é.xlsx")).toBe(
      "Laine-staff-reviewed-e.xlsx",
    );
    expect(storageName("../../x.csv")).toBe("x.csv");
  });
});
