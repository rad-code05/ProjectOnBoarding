import { describe, expect, test } from "vitest";
import { landingFor, navFor, PAGES, roleSummary } from "./navigation";

const labels = (roles: Parameters<typeof navFor>[0]) =>
  navFor(roles).map((item) => item.label);

describe("navFor", () => {
  test("Raju (admin, requester, IT operator) gets the admin menu", () => {
    expect(labels(["admin", "requester", "it_operator"])).toEqual([
      "Requests",
      "Reports",
      "Audit log",
      "Admin",
    ]);
  });

  test("an approver gets Approvals, Records and Reports only", () => {
    expect(labels(["approver"])).toEqual(["Approvals", "Records", "Reports"]);
  });

  test("an auditor gets read-only pages", () => {
    expect(labels(["auditor"])).toEqual(["Records", "Reports", "Audit log"]);
  });

  test("no roles → no menu", () => {
    expect(navFor([])).toEqual([]);
  });

  test("an approver never sees Requests or Admin", () => {
    expect(PAGES.requests.roles).not.toContain("approver");
    expect(PAGES.admin.roles).toEqual(["admin"]);
  });
});

describe("landingFor", () => {
  test("admin lands on Requests", () => {
    expect(landingFor(["admin", "requester", "it_operator"])).toBe("/requests");
  });

  test("approver lands on Approvals", () => {
    expect(landingFor(["approver"])).toBe("/approvals");
  });

  test("no roles → nowhere", () => {
    expect(landingFor([])).toBeNull();
  });
});

describe("roleSummary", () => {
  test("lists the main roles in a fixed order", () => {
    expect(roleSummary(["requester", "it_operator", "admin"])).toBe(
      "Admin · IT operator",
    );
  });

  test("shows Requester only when nothing else applies", () => {
    expect(roleSummary(["requester"])).toBe("Requester");
  });

  test("approver", () => {
    expect(roleSummary(["approver"])).toBe("Approver");
  });
});
