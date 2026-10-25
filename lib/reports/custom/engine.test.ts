import { describe, expect, test } from "vitest";
import type { Row } from "./datasets";
import {
  checkDefinition,
  definitionSchema,
  type Definition,
} from "./definition";
import { matches, runPart } from "./engine";

const TZ = "Asia/Dubai";

const person = (over: Partial<Row>): Row => ({
  name: "Someone",
  email: "someone@example.com",
  department: "Finance",
  office: "Dubai",
  state: null,
  city: null,
  country: "AE",
  nationalities: [],
  onboarded_at: "2026-10-06T08:00:00Z",
  ticket: null,
  leaving: false,
  leaving_ticket: null,
  holds: [],
  ...over,
});

const people: Row[] = [
  person({
    name: "Omar Haddad",
    holds: ["Slack · Regular Member", "Monday.com · Member"],
  }),
  person({
    name: "Sara Nasser",
    onboarded_at: "2026-10-08T05:00:00Z",
    holds: ["Slack · Regular Member", "Monday.com · Admin", "GitHub · Member"],
  }),
  // Slack only.
  person({ name: "Ali Saeed", holds: ["Slack · Regular Member"] }),
  // Both apps, but Abu Dhabi.
  person({
    name: "Hana Kareem",
    office: "Abu Dhabi",
    holds: ["Slack · Regular Member", "Monday.com · Member"],
  }),
  // Both apps, Dubai — but onboarded 12 Oct (Dubai time) — 11 Oct 21:00 UTC.
  person({
    name: "Late Joiner",
    onboarded_at: "2026-10-11T21:00:00Z",
    holds: ["Slack · Regular Member", "Monday.com · Member"],
  }),
  // Bangladeshi, onboarded on even / odd days of September.
  person({
    name: "Rafiq Ahmed",
    office: "Abu Dhabi",
    nationalities: ["BD"],
    onboarded_at: "2026-09-04T06:00:00Z",
  }),
  person({
    name: "Nadia Islam",
    nationalities: ["BD", "GB"],
    onboarded_at: "2026-09-18T06:00:00Z",
  }),
  person({
    name: "Odd Day",
    nationalities: ["BD"],
    onboarded_at: "2026-09-05T06:00:00Z",
  }),
  person({
    name: "Wrong Month",
    nationalities: ["BD"],
    onboarded_at: "2026-08-10T06:00:00Z",
  }),
];

/** Raju's request (2026-10-25), as the robot would write it. */
const rajus: Definition = definitionSchema.parse({
  title:
    "Dubai joiners with Slack & Monday.com · Bangladeshi joiners on even days",
  parts: [
    {
      title: "Dubai joiners with Slack & Monday.com",
      dataset: "people",
      where: {
        all: [
          {
            op: "between",
            field: "onboarded_at",
            from: "2026-10-05",
            to: "2026-10-11",
          },
          { op: "eq", field: "office", value: "Dubai" },
          {
            op: "holds",
            mode: "all",
            items: [{ item: "Slack" }, { item: "Monday.com" }],
          },
        ],
      },
      columns: ["name", "email", "department", "onboarded_at", "holds"],
      sort: [{ by: "name", dir: "asc" }],
    },
    {
      title: "Bangladeshi joiners on even days",
      dataset: "people",
      where: {
        all: [
          { op: "eq", field: "nationalities", value: "bd" },
          { op: "month", field: "onboarded_at", months: [9] },
          { op: "year", field: "onboarded_at", years: [2026] },
          { op: "day_of_month", field: "onboarded_at", days: "even" },
        ],
      },
      columns: ["name", "office", "onboarded_at"],
    },
  ],
});

describe("Raju's example", () => {
  test("the definition is valid", () => {
    expect(checkDefinition(rajus)).toEqual([]);
  });

  test("part 1: Dubai, onboarded 5–11 Oct (Dubai time), holds Slack and Monday.com", () => {
    const r = runPart(rajus.parts[0], people, TZ);
    expect(r.rows.map((x) => x.name)).toEqual(["Omar Haddad", "Sara Nasser"]);
    expect(r.columns.map((c) => c.label)).toEqual([
      "Name",
      "Work email",
      "Department",
      "Onboarded",
      "Holds",
    ]);
    expect(r).toMatchObject({ total: 2, truncated: false });
  });

  test("part 2: Bangladeshi (either nationality), September, even days", () => {
    const r = runPart(rajus.parts[1], people, TZ);
    expect(r.rows.map((x) => x.name)).toEqual(["Rafiq Ahmed", "Nadia Islam"]);
  });
});

describe("conditions", () => {
  const row = people[1]; // Sara: Slack, Monday.com Admin, GitHub; 8 Oct (Thu)
  const ok = (where: unknown) =>
    matches(
      definitionSchema.parse({
        title: "t",
        parts: [{ title: "p", dataset: "people", where, columns: ["name"] }],
      }).parts[0].where!,
      row,
      "people",
      TZ,
    );

  test("holds: all / any / none, with a role, any letter case", () => {
    expect(
      ok({
        op: "holds",
        mode: "any",
        items: [{ item: "figma" }, { item: "github" }],
      }),
    ).toBe(true);
    expect(ok({ op: "holds", mode: "none", items: [{ item: "GitHub" }] })).toBe(
      false,
    );
    expect(
      ok({
        op: "holds",
        mode: "all",
        items: [{ item: "Monday.com", role: "Admin" }],
      }),
    ).toBe(true);
    expect(
      ok({
        op: "holds",
        mode: "all",
        items: [{ item: "Monday.com", role: "Member" }],
      }),
    ).toBe(false);
    // "Slack" doesn't match an app merely starting with the same letters.
    expect(ok({ op: "holds", mode: "any", items: [{ item: "Sla" }] })).toBe(
      false,
    );
  });

  test("AND / OR / NOT, weekday, contains, empty", () => {
    expect(
      ok({
        any: [
          { op: "eq", field: "office", value: "Geneva" },
          { not: { op: "weekday", field: "onboarded_at", days: [6, 7] } },
        ],
      }),
    ).toBe(true);
    expect(ok({ op: "weekday", field: "onboarded_at", days: [4] })).toBe(true); // Thursday
    expect(ok({ op: "contains", field: "email", value: "EXAMPLE" })).toBe(true);
    expect(ok({ op: "empty", field: "city" })).toBe(true);
    expect(ok({ op: "empty", field: "nationalities" })).toBe(true);
    expect(ok({ op: "until", field: "onboarded_at", date: "2026-10-07" })).toBe(
      false,
    );
  });
});

describe("grouping (board: time to approve per approver and month)", () => {
  const sig = (approver: string, approved: string, hours: number): Row => ({
    approved_by: approver,
    approved_at: approved,
    time_to_approve: hours * 3600,
  });
  const signatures = [
    sig("Moises Larez", "2026-09-02T08:00:00Z", 10),
    sig("Moises Larez", "2026-09-20T08:00:00Z", 20),
    sig("Moises Larez", "2026-10-01T08:00:00Z", 6),
    sig("Celine", "2026-10-03T08:00:00Z", 18),
    { approved_by: null, approved_at: null, time_to_approve: null },
  ];
  const def = definitionSchema.parse({
    title: "Average time to approve",
    parts: [
      {
        title: "Per approver and month",
        dataset: "signatures",
        where: { op: "not_empty", field: "approved_at" },
        groupBy: [
          { field: "approved_by" },
          { field: "approved_at", by: "month" },
        ],
        measures: [{ fn: "count" }, { fn: "avg", field: "time_to_approve" }],
        chart: true,
      },
    ],
  });

  test("valid, then one row per approver and month, average in seconds", () => {
    expect(checkDefinition(def)).toEqual([]);
    const r = runPart(def.parts[0], signatures, TZ);
    expect(r.columns.map((c) => c.key)).toEqual([
      "approved_by",
      "approved_at",
      "count",
      "avg_time_to_approve",
    ]);
    expect(r.rows).toEqual([
      {
        approved_by: "Celine",
        approved_at: "2026-10",
        count: 1,
        avg_time_to_approve: 18 * 3600,
      },
      {
        approved_by: "Moises Larez",
        approved_at: "2026-09",
        count: 2,
        avg_time_to_approve: 15 * 3600,
      },
      {
        approved_by: "Moises Larez",
        approved_at: "2026-10",
        count: 1,
        avg_time_to_approve: 6 * 3600,
      },
    ]);
  });

  test("sorted by a measure, slowest first; limit cuts and says so", () => {
    const part = {
      ...def.parts[0],
      sort: [{ by: "avg_time_to_approve", dir: "desc" as const }],
      limit: 2,
    };
    const r = runPart(part, signatures, TZ);
    expect(r.rows.map((x) => x.avg_time_to_approve)).toEqual([
      18 * 3600,
      15 * 3600,
    ]);
    expect(r).toMatchObject({ total: 3, truncated: true });
  });

  test("durations compare in hours", () => {
    const r = runPart(
      {
        ...def.parts[0],
        where: { op: "gt", field: "time_to_approve", value: 12 },
      },
      signatures,
      TZ,
    );
    expect(r.rows.map((x) => x.count)).toEqual([1, 1]);
  });
});

describe("countries", () => {
  test("a country column is marked and sorted by the full name", () => {
    const rows = [
      person({ name: "A", country: "AE" }),
      person({ name: "B", country: "CH" }),
      person({ name: "C", country: "BD" }),
    ];
    const [part] = definitionSchema.parse({
      title: "t",
      parts: [
        {
          title: "p",
          dataset: "people",
          columns: ["name", "country"],
          sort: [{ by: "country", dir: "asc" }],
        },
      ],
    }).parts;
    const out = runPart(part, rows, TZ);
    expect(out.columns[1]).toMatchObject({ key: "country", country: true });
    // Bangladesh, Switzerland, United Arab Emirates — not AE, BD, CH.
    expect(out.rows.map((r) => r.name)).toEqual(["C", "B", "A"]);
  });
  test("a group by nationality keeps the country mark", () => {
    const [part] = definitionSchema.parse({
      title: "t",
      parts: [
        {
          title: "p",
          dataset: "people",
          groupBy: [{ field: "nationalities" }],
        },
      ],
    }).parts;
    expect(runPart(part, people, TZ).columns[0]).toMatchObject({
      country: true,
    });
  });
});

describe("checkDefinition: plain-word problems for the robot", () => {
  const one = (part: Record<string, unknown>) =>
    checkDefinition(
      definitionSchema.parse({ title: "t", parts: [{ title: "p", ...part }] }),
    );

  test("unknown fields, wrong conditions, holds outside People", () => {
    expect(one({ dataset: "people", columns: ["salary"] })).toEqual([
      'Part 1 (People today): there is no field "salary".',
    ]);
    expect(
      one({
        dataset: "people",
        columns: ["name"],
        where: { op: "gt", field: "office", value: 3 },
      }),
    ).toEqual(['Part 1 (People today): "gt" doesn\'t fit "office" (text).']);
    expect(
      one({
        dataset: "requests",
        columns: ["ticket"],
        where: { op: "holds", mode: "any", items: [{ item: "Slack" }] },
      }),
    ).toEqual([
      'Part 1 (Requests): "holds" works on People today only — build that part from People today.',
    ]);
  });

  test("grouping rules: averages need a group, a date bucket needs a date, sort what is shown", () => {
    expect(
      one({
        dataset: "signatures",
        columns: ["ticket"],
        measures: [{ fn: "count" }],
      }),
    ).toEqual(['Part 1 (Signatures): totals and averages need a "group by".']);
    expect(
      one({ dataset: "people", groupBy: [{ field: "office", by: "month" }] }),
    ).toEqual([
      'Part 1 (People today): only a date can be grouped by month ("office" is text).',
    ]);
    expect(
      one({
        dataset: "people",
        groupBy: [{ field: "office" }],
        measures: [{ fn: "avg", field: "name" }],
      }),
    ).toEqual(['Part 1 (People today): can\'t take the avg of "name" (text).']);
    expect(
      one({
        dataset: "people",
        columns: ["name"],
        sort: [{ by: "office", dir: "asc" }],
      }),
    ).toEqual([
      "Part 1 (People today): can't sort by \"office\" — it isn't shown.",
    ]);
  });

  test("the schema refuses what isn't the language", () => {
    const bad = (x: unknown) => definitionSchema.safeParse(x).success;
    expect(bad({ title: "t", parts: [] })).toBe(false);
    expect(
      bad({
        title: "t",
        parts: Array(6).fill({
          title: "p",
          dataset: "people",
          columns: ["name"],
        }),
      }),
    ).toBe(false);
    expect(
      bad({
        title: "t",
        parts: [{ title: "p", dataset: "audit_events", columns: ["action"] }],
      }),
    ).toBe(false);
    expect(
      bad({
        title: "t",
        parts: [
          {
            title: "p",
            dataset: "people",
            columns: ["name"],
            where: { sql: "1=1" },
          },
        ],
      }),
    ).toBe(false);
    expect(
      bad({
        title: "t",
        parts: [
          { title: "p", dataset: "people", columns: ["name; drop table x"] },
        ],
      }),
    ).toBe(false);
  });
});
