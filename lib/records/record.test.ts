import { describe, expect, test } from "vitest";
import {
  sampleAccessChangeRecord,
  sampleOffboardingRecord,
  sampleRecord,
} from "./fixture";
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

describe("form v4.2 (F27)", () => {
  test("section 2 shows office and location, never nationality", () => {
    const base = sampleRecord();
    const placed = sampleRecord({
      snapshot: {
        ...base.snapshot,
        request: {
          ...base.snapshot.request,
          office: "US",
          region: "Texas",
          office_city: "Austin",
          nationalities: ["CH"],
        },
      },
    });
    expect(rows(2, placed)).toMatchObject({
      Office: "US",
      Location: "Texas · Austin",
    });
    expect(Object.keys(rows(2, placed))).not.toContain("Nationality");
    expect(Object.keys(rows(2))).not.toContain("Office");
  });
});

describe("an offboarding record (F09d-3)", () => {
  const sections = recordSections(sampleOffboardingRecord());
  const rows = (n: number) => sections.find((s) => s.number === n)?.rows ?? [];

  test("section 5: how and when each application was removed, no 'No change' row", () => {
    expect(rows(5)).toEqual([
      { label: "Slack", value: "Delete · had Member · 1 Oct 2026, 12:05" },
      {
        label: "Google Workspace",
        value: "Suspend · had User · 1 Oct 2026, 12:10",
      },
    ]);
  });

  test("sections 6 and 7: returns and disabled access", () => {
    expect(rows(6)[0].value).toBe(
      "Not returned · LN-0042 · Lost by the courier · 2 Oct 2026, 10:00",
    );
    expect(rows(7)[0].value).toBe("Disable · Badge · 1 Oct 2026, 12:20");
  });

  test("section 8: the SLA result and the handover, in the company timezone", () => {
    expect(rows(8)).toEqual([
      { label: "Timeline", value: "Within 24h" },
      { label: "Last working day", value: "30 Sept 2026" },
      { label: "Access cut-off", value: "30 Sept 2026, 18:00" },
      { label: "Deadline", value: "1 Oct 2026, 18:00" },
      { label: "Last access removed", value: "1 Oct 2026, 12:20" },
      { label: "Removed within SLA", value: "Met · 3 of 3 removed" },
      { label: "Data & mailbox go to", value: "Mara Manager" },
      { label: "Mailbox", value: "Converted to a shared mailbox" },
    ]);
  });
});

test("section 9 prints No changes made on an access change (2026-10-14)", () => {
  const input = sampleAccessChangeRecord();
  input.snapshot.execution = {
    ...input.snapshot.execution!,
    checks: {
      access_provisioned: true,
      devices_enrolled: "no_change",
      security_controls: "no_change",
    },
  };
  const rows = recordSections(input).find((s) => s.number === 9)!.rows;
  expect(rows.slice(0, 3).map((r) => r.value)).toEqual([
    "Yes",
    "No changes made",
    "No changes made",
  ]);
});

test("section 9 prints Not needed for an item that didn't apply (2026-10-13)", () => {
  const input = sampleRecord();
  input.snapshot.execution = {
    ...input.snapshot.execution!,
    checks: {
      access_provisioned: true,
      devices_enrolled: "not_needed",
      security_controls: false,
    },
  };
  const rows = recordSections(input).find((s) => s.number === 9)!.rows;
  expect(rows.slice(0, 3).map((r) => r.value)).toEqual([
    "Yes",
    "Not needed",
    "No",
  ]);
});

describe("an access change record (F10d)", () => {
  const sections = recordSections(sampleAccessChangeRecord());
  const rows = (n: number) => sections.find((s) => s.number === n)?.rows ?? [];

  test("section 2 says what changed since the previous request", () => {
    expect(rows(2)).toContainEqual({
      label: "Job title (changed)",
      value: "Product Designer to Design Lead",
    });
    // Only what differs: the department stayed the same.
    expect(
      rows(2)
        .filter((row) => row.label.endsWith("(changed)"))
        .map((row) => row.label),
    ).toEqual(["Job title (changed)"]);
  });

  test("section 5: changed, removed, added, then what is kept", () => {
    expect(rows(5)).toEqual([
      // The PDF fonts have no arrow: "to" (screens show "Viewer → Full").
      { label: "Figma", value: "Viewer to Full" },
      { label: "Slack", value: "Removed · had Member" },
      { label: "GitHub", value: "Added · Grant · Maintain" },
      { label: "Google Workspace (kept)", value: "User" },
      { label: "Zoom (kept)", value: "Licensed" },
    ]);
  });

  test("sections 6 and 7: a returned device and a changed scope", () => {
    expect(rows(6)[0].value).toBe("Returned · LN-0042");
    expect(rows(7)[0].value).toBe("Badge to Key");
  });
});
