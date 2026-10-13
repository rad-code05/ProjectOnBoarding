import { describe, expect, test } from "vitest";
import { buildLeavers, filterLeavers, leaverNote } from "./leavers-shared";

const people = [
  {
    id: "p1",
    email: "marco.rossi@laine.ai",
    firstName: "Marco",
    lastName: "R.",
  },
  {
    id: "p2",
    email: "omar.haddad@laine.ai",
    firstName: "Omar",
    lastName: "Haddad",
  },
  { id: "p3", email: "no.items@laine.ai", firstName: "No", lastName: "Items" },
];

const leavers = buildLeavers({
  held: [
    {
      employeeId: "p1",
      grantedAt: "2026-03-01T10:00:00Z",
      ticketId: "UAM-2026-000120",
    },
    {
      employeeId: "p1",
      grantedAt: "2026-01-05T10:00:00Z",
      ticketId: "UAM-2026-000098",
    },
    {
      employeeId: "p2",
      grantedAt: "2026-02-01T10:00:00Z",
      ticketId: "UAM-2026-000101",
    },
  ],
  people,
  closed: [
    // newest first: Marco's latest request renamed him and moved him to Sales
    {
      employeeId: "p1",
      firstName: "Marco",
      lastName: "Rossi",
      department: "Sales",
      country: "IT",
    },
    {
      employeeId: "p1",
      firstName: "Marco",
      lastName: "R.",
      department: "Tech",
      country: "CH",
    },
    {
      employeeId: "p2",
      firstName: "Omar",
      lastName: "Haddad",
      department: null,
      country: "AE",
    },
  ],
  open: [{ employeeId: "p2", ticketId: "UAM-2026-000131" }],
});

describe("buildLeavers", () => {
  test("only people holding something, sorted by name", () => {
    expect(leavers.map((l) => l.name)).toEqual(["Marco Rossi", "Omar Haddad"]);
  });

  test("details come from the latest closed request; items and the first ticket are counted", () => {
    expect(leavers[0]).toMatchObject({
      detail: "Sales · Italy",
      items: 2,
      since: "UAM-2026-000098",
      openTicket: null,
    });
    expect(leavers[1].detail).toBe("United Arab Emirates");
  });

  test("an open offboarding is shown instead of the item count", () => {
    expect(leaverNote(leavers[0])).toBe(
      "2 items on record · since UAM-2026-000098",
    );
    expect(leaverNote(leavers[1])).toBe(
      "Offboarding already open · UAM-2026-000131",
    );
  });
});

describe("filterLeavers", () => {
  test("by name or work email, ignoring case", () => {
    expect(filterLeavers(leavers, "ROSSI").map((l) => l.id)).toEqual(["p1"]);
    expect(filterLeavers(leavers, "omar.h").map((l) => l.id)).toEqual(["p2"]);
    expect(filterLeavers(leavers, "  ")).toHaveLength(2);
  });
});
