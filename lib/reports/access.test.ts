import { describe, expect, test } from "vitest";
import {
  accessFileName,
  accessHolder,
  accessTotals,
  holdersHref,
  parseAccessKind,
  parseItemKey,
  permissionBars,
  type RawAccessHolder,
} from "./access";

const holder: RawAccessHolder = {
  inventory_id: "i1",
  item_key: "app:4",
  name: "GitHub",
  category_name: "Core business",
  permission: "Maintain",
  description: null,
  asset_tag: null,
  source: "request",
  granted_at: "2026-03-03T06:00:00Z",
  granted_request_id: "g1",
  granted_ticket_id: "UAM-2026-000021",
  first_name: "Jonas",
  last_name: "Meier",
  work_email: "jonas.meier@example.test",
  department: "Engineering",
  country: "CH",
  leaving_request_id: "o1",
  leaving_ticket_id: "UAM-2026-000149",
};
const opts = {
  timeZone: "Asia/Dubai",
  canOpenRequests: true,
  isApprover: false,
};

describe("URL parts", () => {
  test("the tab defaults to Applications", () => {
    expect(parseAccessKind(undefined)).toBe("application");
    expect(parseAccessKind("equipment")).toBe("equipment");
    expect(parseAccessKind("nonsense")).toBe("application");
  });
  test("item keys as the database writes them", () => {
    expect(parseItemKey("app:12")).toBe("app:12");
    expect(parseItemKey("other:notion")).toBe("other:notion");
    expect(parseItemKey("access:3")).toBe("access:3");
    expect(parseItemKey("app:x")).toBeNull();
    expect(parseItemKey(undefined)).toBeNull();
  });
  test("a holders link keeps the filters and the search, not Show all", () => {
    expect(
      holdersHref(
        "application",
        "app:12",
        new URLSearchParams("q=git&country=CH&all=1"),
      ),
    ).toBe(
      "/reports/access-by-application/holders?kind=application&item=app%3A12&q=git&country=CH",
    );
  });
  test("file names", () => {
    expect(accessFileName("application", null, "2026-10-20", "csv")).toBe(
      "access-by-application_applications_2026-10-20.csv",
    );
    expect(
      accessFileName("application", "Hexnode (MDM)", "2026-10-20", "pdf"),
    ).toBe("access-by-application_hexnode-mdm_2026-10-20.pdf");
  });
});

describe("accessHolder", () => {
  test("person, department · country, permission, since, granting request, Leaving", () => {
    expect(accessHolder(holder, "application", opts)).toEqual({
      id: "i1",
      name: "Jonas Meier",
      subtitle: "jonas.meier@example.test · Engineering · Switzerland",
      detail: "Maintain",
      since: "3 Mar 2026",
      grantedBy: "UAM-2026-000021",
      grantedHref: "/records/g1",
      leaving: { ticketId: "UAM-2026-000149", href: "/requests/o1" },
    });
  });
  test("devices show the asset tag; imported rows say so; approvers open approvals", () => {
    const device = accessHolder(
      {
        ...holder,
        permission: null,
        asset_tag: "LT-42",
        source: "import",
        granted_request_id: null,
        granted_ticket_id: null,
      },
      "equipment",
      { ...opts, canOpenRequests: false, isApprover: true },
    );
    expect(device).toMatchObject({
      detail: "LT-42",
      grantedBy: "Excel import",
      grantedHref: null,
      leaving: { href: "/approvals/o1" },
    });
    expect(
      accessHolder(
        { ...holder, leaving_request_id: null, leaving_ticket_id: null },
        "application",
        opts,
      ).leaving,
    ).toBeNull();
  });
});

describe("totals and permission bars", () => {
  test("totals from the first row; zeros when nothing is held", () => {
    expect(
      accessTotals([
        {
          item_key: "app:1",
          name: "Slack",
          category_name: "Core business",
          holders: 2,
          total_people: 3,
          total_rights: 4,
          items_in_use: 3,
          catalog_count: 38,
          leaving_people: 1,
        },
      ]),
    ).toEqual({ people: 3, rights: 4, inUse: 3, catalog: 38, leaving: 1 });
    expect(accessTotals([]).people).toBe(0);
  });
  test("most first, with shares; an empty permission is named", () => {
    expect(
      permissionBars({ Admin: 4, Maintain: 18, "": 1 }).map((r) => [
        r.label,
        r.onboarded,
        r.share,
      ]),
    ).toEqual([
      ["Maintain", 18, "78%"],
      ["Admin", 4, "17%"],
      ["No permission", 1, "4%"],
    ]);
    expect(permissionBars(null)).toEqual([]);
  });
});
