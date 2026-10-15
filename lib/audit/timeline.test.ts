import { describe, expect, test } from "vitest";
import { activityEntries } from "./timeline";

const moises = { actor_id: "user_moises", actor_name: "Moises Larez" };
const raju = { actor_id: "user_raju", actor_name: "Raju Bholani" };
const at = "2026-10-15T07:00:00Z";

describe("activityEntries — board: Request activity", () => {
  test("signed, returned, signed again with a note, confirmed; repeats left out", () => {
    const entries = activityEntries([
      {
        id: 9,
        created_at: at,
        source: "user",
        ...moises,
        action: "request.confirmed",
        diff: {},
        note: null,
      },
      {
        id: 8,
        created_at: at,
        source: "user",
        ...moises,
        action: "request.state_changed",
        diff: { to: "closed" },
        note: null,
      },
      {
        id: 7,
        created_at: at,
        source: "user",
        ...raju,
        action: "request.signed",
        diff: { note: "Figma Admin is for the library." },
        note: "Figma Admin is for the library.",
      },
      {
        id: 6,
        created_at: at,
        source: "user",
        ...moises,
        action: "request.returned",
        diff: { flagged_sections: [5] },
        note: "Why does Anna need Figma Admin?",
      },
      {
        id: 5,
        created_at: at,
        source: "user",
        ...raju,
        action: "request.signed",
        diff: {},
        note: null,
      },
      {
        id: 4,
        created_at: at,
        source: "user",
        ...raju,
        action: "request.state_changed",
        diff: { from: "draft", to: "in_execution" },
        note: null,
      },
    ]);
    expect(
      entries.map((e) => [e.who, e.what, e.context, e.note, e.dot]),
    ).toEqual([
      ["Moises Larez", "confirmed, signed and closed it", null, null, "key"],
      [
        "Raju Bholani",
        "signed again (Review & sign)",
        null,
        "Note for the approver: “Figma Admin is for the library.”",
        "key",
      ],
      [
        "Moises Larez",
        "returned it to IT",
        "flagged section 5",
        "“Why does Anna need Figma Admin?”",
        "return",
      ],
      ["Raju Bholani", "signed (Review & sign)", null, null, "key"],
      ["Raju Bholani", "started execution", null, null, "step"],
    ]);
  });
});
