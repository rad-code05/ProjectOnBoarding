import { describe, expect, test } from "vitest";
import {
  roleChangeLines,
  roleList,
  type RoleChangeEvent,
} from "./role-changes-shared";

const T1 = "2026-10-31T09:58:00.123+00:00";
const T2 = "2026-10-31T10:12:00.456+00:00";
let id = 0;
const ev = (over: Partial<RoleChangeEvent>): RoleChangeEvent => ({
  id: ++id,
  created_at: T1,
  action: "role.granted",
  actor_name: "Raju Bholani",
  target_name: "Aisha Noor",
  roles: ["auditor"],
  is_new: false,
  ...over,
});

describe("Role changes for approvers (F18d-2)", () => {
  test("role names in words", () => {
    expect(roleList(["approver"])).toBe("Approver");
    expect(roleList(["approver", "auditor"])).toBe("Approver and Auditor");
    expect(roleList(["approver", "auditor", "admin"])).toBe(
      "Approver, Auditor and Admin",
    );
  });

  test("one saved action = one line; given and taken together", () => {
    const lines = roleChangeLines([
      ev({ created_at: T2, roles: ["requester"], is_new: true }),
      ev({ created_at: T2, action: "role.revoked", roles: ["auditor"] }),
      ev({ roles: ["auditor"] }),
    ]);
    expect(lines.map((l) => [l.who, l.what, l.isNew])).toEqual([
      ["Raju Bholani", "gave Aisha Noor Requester and took Auditor away", true],
      ["Raju Bholani", "gave Aisha Noor Auditor", false],
    ]);
  });

  test("invited, sent again, withdrawn", () => {
    const lines = roleChangeLines([
      ev({
        created_at: T2,
        action: "user.invited",
        target_name: "Celine Example",
        roles: ["approver"],
      }),
      ev({
        action: "user.invitation_withdrawn",
        target_name: "Dee Drop",
        roles: ["requester"],
      }),
    ]);
    expect(lines.map((l) => l.what)).toEqual([
      "invited Celine Example as Approver",
      "withdrew Dee Drop's invitation",
    ]);
    expect(
      roleChangeLines([
        ev({ action: "user.invitation_sent_again", target_name: "Celine" }),
      ])[0]!.what,
    ).toBe("sent Celine's invitation again");
  });

  test("deactivated with the roles removed; reactivated with the roles given", () => {
    expect(
      roleChangeLines([
        ev({ action: "user.deactivated", roles: [] }),
        ev({ action: "role.revoked", roles: ["auditor"] }),
      ])[0]!.what,
    ).toBe("deactivated Aisha Noor (Auditor removed)");
    expect(
      roleChangeLines([
        ev({ action: "user.reactivated", roles: [] }),
        ev({ roles: ["approver"] }),
      ])[0]!.what,
    ).toBe("reactivated Aisha Noor as Approver");
  });

  test("an accepted invitation is told from the person's side; no actor = System", () => {
    expect(
      roleChangeLines([
        ev({
          action: "user.invitation_accepted",
          actor_name: null,
          target_name: "Celine Example",
          roles: ["approver"],
        }),
        ev({
          actor_name: null,
          target_name: "Celine Example",
          roles: ["approver"],
        }),
      ]),
    ).toMatchObject([
      { who: "Celine Example", what: "accepted the invitation — now Approver" },
    ]);
    expect(
      roleChangeLines([ev({ actor_name: null, roles: ["admin"] })])[0],
    ).toMatchObject({ who: "System", what: "gave Aisha Noor Admin" });
  });
});
