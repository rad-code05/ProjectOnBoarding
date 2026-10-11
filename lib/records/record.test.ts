import { describe, expect, test } from "vitest";
import { sampleRecord } from "./fixture";
import { formatInZone, recordSections } from "./record";

const rows = (number: number, input = sampleRecord()) =>
  Object.fromEntries(
    recordSections(input)
      .find((s) => s.number === number)!
      .rows.map((r) => [r.label, r.value]),
  );

describe("the PDF record", () => {
  test("has sections 1–10 in order (11 is drawn with the signatures)", () => {
    expect(recordSections(sampleRecord()).map((s) => s.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  test("prints times in the company timezone (D3)", () => {
    expect(formatInZone("2026-10-09T12:05:00Z", "Asia/Dubai")).toBe(
      "9 Oct 2026, 16:05",
    );
    expect(formatInZone("2026-10-09T12:05:00Z", "Europe/Zurich")).toBe(
      "9 Oct 2026, 14:05",
    );
    expect(rows(1)["Opened / closed"]).toBe(
      "8 Oct 2026, 14:12 / 9 Oct 2026, 16:05",
    );
  });

  test("sections 1–2 come from the request and the snapshot", () => {
    expect(rows(1)).toMatchObject({
      "Ticket type": "Onboarding",
      "Ticket ID": "UAM-2026-000124",
      Status: "Closed",
      Priority: "Medium",
      "Assignee (IT owner)": "Raju Bholani",
    });
    expect(rows(2)).toMatchObject({
      "Employee name": "José Müller",
      "Manager / requestor": "Mara Manager / Rita Requestor",
      Country: "United Arab Emirates",
      "Employment event · effective date": "Start · 14 Oct 2026",
    });
  });

  test("section 5 lists the apps with an action, then No change for the rest", () => {
    expect(rows(5)).toEqual({
      "Google Workspace": "Grant · User",
      Slack: "Grant · Member",
      Figma: "Grant · Viewer",
      Zoom: "Grant · Licensed",
      "All other catalog applications": "No change",
    });
  });

  test("empty sections say so; section 8 is not applicable on onboarding", () => {
    const input = sampleRecord();
    input.snapshot = { ...input.snapshot, equipment: [], physical_access: [] };
    expect(rows(6, input)).toEqual({ Equipment: "—" });
    expect(rows(7, input)).toEqual({ "Physical & logical access": "—" });
    expect(rows(8)).toEqual({
      "Applies to": "Offboarding only — not applicable",
    });
  });

  test("section 9: each check, the notes, who executed, the note for the approver", () => {
    expect(rows(9)).toMatchObject({
      "Devices issued and enrolled (MDM)": "Yes",
      "Implementation notes": "Laptop shipped with MDM profile.",
      "Executed by · date": "Raju Bholani · 9 Oct 2026, 14:12",
      "Note for the approver": "Figma is Viewer now",
    });
  });

  test("sections 3 and 10 name the approver and the approval time", () => {
    expect(rows(3)).toMatchObject({
      Approver: "Moises Larez · Approver",
      Decision: "Approved",
      "Approval date": "9 Oct 2026, 16:05",
    });
    expect(rows(10)).toMatchObject({
      "Final reviewer": "Moises Larez",
      "Closure confirmation": "Confirmed complete",
    });
  });
});
