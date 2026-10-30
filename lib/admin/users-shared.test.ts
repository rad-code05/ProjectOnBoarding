import { describe, expect, test } from "vitest";
import {
  lockedRoles,
  personMeta,
  personName,
  roleLabels,
  sameRoles,
  sortPeople,
  usersErrorMessage,
  type AdminPerson,
} from "./users-shared";

const person = (over: Partial<AdminPerson>): AdminPerson => ({
  id: "user_x",
  email: "x@example.test",
  firstName: null,
  lastName: null,
  roles: [],
  active: true,
  mfa: true,
  lastSignInAt: null,
  ...over,
});

const raju = person({
  id: "user_raju",
  firstName: "Raju",
  lastName: "Bholani",
  roles: ["admin", "requester", "it_operator"],
});
const moises = person({
  id: "user_moises",
  firstName: "Moises",
  lastName: "Larez",
  roles: ["approver"],
});
const gone = person({
  id: "user_gone",
  firstName: "Gone",
  roles: ["approver"],
  active: false,
});

describe("Users & roles (F18b)", () => {
  test("a name, or the email when Clerk has none", () => {
    expect(personName(raju)).toBe("Raju Bholani");
    expect(personName(person({ email: "new@example.test" }))).toBe(
      "new@example.test",
    );
  });

  test("roles in a fixed order with their labels", () => {
    expect(roleLabels(["admin", "it_operator", "approver"])).toEqual([
      "Approver",
      "IT operator",
      "Admin",
    ]);
    expect(sameRoles(["admin", "approver"], ["approver", "admin"])).toBe(true);
    expect(sameRoles(["admin"], ["admin", "auditor"])).toBe(false);
  });

  test("the only active approver / admin keeps that role; a deactivated one doesn't count", () => {
    const people = [raju, moises, gone];
    expect(lockedRoles(moises, people)).toEqual({
      approver: "The only active approver — locked on.",
    });
    expect(lockedRoles(raju, people)).toEqual({
      admin: "The only active admin — locked on.",
    });
    const celine = person({ id: "user_celine", roles: ["approver"] });
    expect(lockedRoles(moises, [...people, celine])).toEqual({});
    expect(lockedRoles(gone, people)).toEqual({});
  });

  test("MFA and last sign-in in words", () => {
    expect(personMeta(raju, null)).toBe("MFA on · never signed in");
    expect(
      personMeta({ mfa: false, lastSignInAt: 1 }, "30 Oct 2026, 09:41"),
    ).toBe("MFA off · signed in 30 Oct 2026, 09:41");
    expect(personMeta({ mfa: null, lastSignInAt: null }, null)).toBe(
      "MFA unknown · last sign-in unknown",
    );
  });

  test("active first, you first among them, then by name", () => {
    expect(
      sortPeople([gone, moises, raju], "user_raju").map((p) => p.id),
    ).toEqual(["user_raju", "user_moises", "user_gone"]);
  });

  test("the database's refusals as sentences", () => {
    expect(
      usersErrorMessage("23514", "at least one active approver must remain"),
    ).toBe("At least one active approver must remain.");
    expect(usersErrorMessage("42501", "nobody changes their own roles")).toBe(
      "Nobody changes their own roles — ask another admin.",
    );
    expect(usersErrorMessage("42501", "only an admin changes the lists")).toBe(
      "Only an admin changes roles.",
    );
    expect(usersErrorMessage(undefined, "network")).toBe(
      "Could not save. Reload and try again.",
    );
  });
});
