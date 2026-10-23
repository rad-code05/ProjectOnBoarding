// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  findPeople,
  groupHolders,
  matchesPermission,
  normalize,
  pickPerson,
  type HeldRow,
} from "./people-shared";

const people = [
  {
    id: "1",
    email: "rose@laine.ai",
    firstName: "Rose",
    lastName: "Bernal-Test",
  },
  {
    id: "2",
    email: "amigo@gmail.com",
    firstName: "manuel",
    lastName: "amigo test",
  },
  { id: "3", email: "rosa@laine.ai", firstName: "Rosa", lastName: "Müller" },
];

describe("finding people", () => {
  test("case, accents and spaces don't matter", () => {
    expect(normalize("  Zoë   MÜLLER ")).toBe("zoe muller");
    expect(findPeople(people, "rosa muller").map((p) => p.id)).toEqual(["3"]);
  });

  test("every word must match the name or the email", () => {
    // Alphabetical: Rosa Müller, then Rose Bernal-Test.
    expect(findPeople(people, "ros").map((p) => p.id)).toEqual(["3", "1"]);
    expect(findPeople(people, "amigo@").map((p) => p.id)).toEqual(["2"]);
    expect(findPeople(people, "rose amigo")).toEqual([]);
  });

  test("one person: the exact email or name, or the only match — else ask", () => {
    expect(pickPerson(people, "rose@laine.ai")).toEqual({ person: people[0] });
    expect(pickPerson(people, "Rose Bernal-Test")).toEqual({
      person: people[0],
    });
    expect(pickPerson(people, "amigo")).toEqual({ person: people[1] });
    expect(pickPerson(people, "ros")).toEqual({
      matches: [people[2], people[0]],
    });
    expect(pickPerson(people, "nobody")).toEqual({ matches: [] });
  });
});

describe("holders", () => {
  test("a permission matches any of several roles in one row", () => {
    expect(matchesPermission("Viewer; Admin", "admin")).toBe(true);
    expect(matchesPermission("Member", "admin")).toBe(false);
    expect(matchesPermission(null, "admin")).toBe(false);
  });

  test("grouped per item, alphabetical, leaving marked", () => {
    const row = (
      item: string,
      person: string,
      employeeId: string,
    ): HeldRow => ({
      kind: "application",
      item,
      permission: "Admin",
      since: "2026-10-12T08:00:00Z",
      employeeId,
      person,
      email: `${employeeId}@laine.ai`,
    });
    const groups = groupHolders(
      [
        row("Monday.com", "hello test user", "b"),
        row("Cursor", "manuel amigo test", "a"),
      ],
      new Set(["b"]),
    );
    expect(groups.map((g) => g.item)).toEqual(["Cursor", "Monday.com"]);
    expect(groups[1].holders[0]).toMatchObject({
      person: "hello test user",
      leaving: true,
    });
    expect(groups[0].holders[0].leaving).toBe(false);
  });
});
