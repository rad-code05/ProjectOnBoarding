import { describe, expect, test } from "vitest";
import { auditCsv, csvCell, type ExportRow } from "./csv";

describe("csvCell", () => {
  test("quotes commas, quotes and line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", twice')).toBe('"say ""hi"", twice"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(3159)).toBe("3159");
  });

  test("never lets a spreadsheet run a formula", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("=1,2")).toBe(`"'=1,2"`);
  });
});

describe("auditCsv", () => {
  const row: ExportRow = {
    id: 3159,
    created_at: "2026-10-15T06:48:12.123456+00:00",
    action: "request.access_changed",
    group_key: "requests",
    source: "user",
    actor_id: "user_raju",
    actor_name: "Raju Bholani",
    actor_email: "raju@example.test",
    actor_roles: ["admin", "it_operator"],
    is_test_user: false,
    entity: "request",
    entity_id: "r1",
    request_id: "r1",
    ticket_id: "UAM-2026-000141",
    request_type: "access_modification",
    employee_name: "Anna Keller",
    diff: {
      app: "Figma",
      before: { permission: "Editor" },
      after: { permission: "Admin" },
    },
  };

  test("header + one row per event, in plain words and raw details", () => {
    const csv = auditCsv([row], "Asia/Dubai", {});
    expect(csv.startsWith("\uFEFF")).toBe(true); // Excel reads UTF-8
    const [header, line, end] = csv.slice(1).split("\r\n");
    expect(header).toBe(
      "Event #,Time (UTC),Time (Dubai),Who,Email,Roles,Source,Group,What happened,Ticket,Person,Request type,Details",
    );
    expect(line).toBe(
      [
        "3159",
        "2026-10-15T06:48:12.123Z",
        '"15 Oct 2026, 10:48:12"',
        "Raju Bholani",
        "raju@example.test",
        '"Admin, IT operator"',
        "People",
        "Requests",
        "changed Figma on UAM-2026-000141 — Editor → Admin",
        "UAM-2026-000141",
        "Anna Keller",
        "Access modification",
        csvCell(JSON.stringify(row.diff)),
      ].join(","),
    );
    expect(end).toBe("");
  });
});
