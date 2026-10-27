import { describe, expect, test } from "vitest";
import type { Leaver } from "@/lib/requests/leavers-shared";
import {
  removalSuggestions,
  askAboutOffboarding,
  findLeaver,
  missingOffboardingTopics,
  resolveOffboarding,
} from "./offboarding-shared";

const leaver = (over: Partial<Leaver>): Leaver => ({
  id: "e1",
  name: "Arjun Mehta",
  email: "arjun.mehta@example.com",
  detail: "Engineering · United Arab Emirates",
  items: 7,
  since: "UAM-2026-000300",
  openTicket: null,
  openChange: null,
  ...over,
});

const leavers = [
  leaver({}),
  leaver({ id: "e2", name: "Arjun Kapoor", email: "arjun.kapoor@example.com" }),
  leaver({
    id: "e3",
    name: "Joseph dela Cruz",
    email: "joseph@example.com",
    openTicket: "UAM-2026-000390",
  }),
];

const complete = {
  person: "Arjun Mehta",
  lastWorkingDay: "2026-10-30",
  slaTimeline: "same_day" as const,
  cutoffDate: "2026-10-30",
  cutoffTime: "18:00",
  handoverTo: "Rafiq Ahmed",
  removalMethod: "Suspend" as const,
  mailbox: "converted_shared" as const,
};

describe("findLeaver", () => {
  test("by email, by name in any order and case — or a problem", () => {
    expect(findLeaver(leavers, "ARJUN.KAPOOR@example.com")).toMatchObject({
      leaver: { id: "e2" },
    });
    expect(findLeaver(leavers, "mehta arjun")).toMatchObject({
      leaver: { id: "e1" },
    });
    expect(findLeaver(leavers, "Arjun")).toMatchObject({
      problem: expect.stringContaining("Several people match"),
    });
    expect(findLeaver(leavers, "Nobody Here")).toMatchObject({
      problem: expect.stringContaining("holds anything on record"),
    });
  });
});

describe("the offboarding checklist", () => {
  test("open topics are asked about — incl. the removal method and the mailbox (Raju, 2026-10-27)", () => {
    expect(missingOffboardingTopics({ person: "Arjun" })).toEqual([
      "lastWorkingDay",
      "slaTimeline",
      "cutoff",
      "handoverTo",
      "removalMethod",
      "mailbox",
    ]);
    // "Data will be deleted" is written down as the handover.
    expect(
      missingOffboardingTopics({
        ...complete,
        handoverTo: "Not needed — data will be deleted",
        removalMethod: undefined,
        removalMethods: [{ app: "Slack", method: "Delete" }],
      }),
    ).toEqual([]);
    expect(
      askAboutOffboarding({
        person: "Arjun",
        ...{ lastWorkingDay: "2026-10-30" },
      }),
    ).toContain("Ask about: SLA");
  });

  test("complete: the timing as suggestions, the cut-off in company time", () => {
    const r = resolveOffboarding(complete, leavers, "Asia/Dubai");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.leaver.id).toBe("e1");
    expect(r.suggestions).toEqual([
      { kind: "field", target: "sla_timeline", value: "same_day" },
      { kind: "field", target: "last_working_day", value: "2026-10-30" },
      {
        kind: "field",
        target: "access_cutoff_at",
        value: "2026-10-30T14:00:00.000Z",
      },
      { kind: "field", target: "handover_to", value: "Rafiq Ahmed" },
      // The effective date of an offboarding = the last working day.
      { kind: "field", target: "effective_date", value: "2026-10-30" },
      { kind: "mailbox", target: "mailbox", value: "converted_shared" },
    ]);
  });

  test("the removal method per application row: per app if said, else for all", () => {
    const rows = [
      { id: "r1", app_name: "Slack" },
      { id: "r2", app_name: "GitHub" },
    ];
    expect(
      removalSuggestions(rows, {
        removalMethod: "Suspend",
        removalMethods: [{ app: "github", method: "Delete" }],
      }),
    ).toEqual({
      problems: [],
      suggestions: [
        { kind: "removal", target: "removal:r1", value: { method: "Suspend" } },
        { kind: "removal", target: "removal:r2", value: { method: "Delete" } },
      ],
    });
    expect(
      removalSuggestions(rows, {
        removalMethods: [{ app: "Zoom", method: "Delete" }],
      }).problems,
    ).toEqual(['They don\'t hold "Zoom" (applications: Slack, GitHub).']);
  });

  test("already leaving, bad dates: problems, nothing resolved", () => {
    const r = resolveOffboarding(
      {
        ...complete,
        person: "Joseph dela Cruz",
        lastWorkingDay: "Friday",
        cutoffTime: "6pm",
      },
      leavers,
      "Asia/Dubai",
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems).toEqual([
      "Joseph dela Cruz: Offboarding already open · UAM-2026-000390. Offer to add to that one instead (suggestValues with its ticket).",
      "The last working day must be a day like 2026-10-30.",
      "The access cut-off needs a day like 2026-10-30 and a time like 18:00 (company time).",
    ]);
  });
});
