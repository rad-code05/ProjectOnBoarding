import { describe, expect, test } from "vitest";
import { DATASETS, DATASET_KEYS, fieldOf } from "./datasets";
import {
  accessRows,
  holdingLabel,
  peopleRows,
  personIndex,
  requestRows,
  signatureRows,
  slaRows,
  type EmployeeRow,
  type HeldRow,
  type RequestRow,
  type SignatureRow,
  type SlaRow,
} from "./rows";

const employee = (over: Record<string, unknown> = {}) =>
  // Database rows: the generated types call every column non-null.
  ({
    employee_id: "e1",
    first_name: "Omar",
    last_name: "Haddad",
    work_email: "omar.haddad@example.com",
    department: "Finance",
    country: "AE",
    office: "Dubai",
    region: null,
    city: null,
    nationalities: ["JO"],
    onboarded_at: "2026-10-06T08:00:00Z",
    latest_request_id: "r1",
    latest_ticket_id: "UAM-2026-000201",
    leaving_request_id: null,
    leaving_ticket_id: null,
    total_count: 1,
    ...over,
  }) as unknown as EmployeeRow;

const held = (over: Record<string, unknown> = {}) =>
  // Database rows: the generated types call every column non-null.
  ({
    inventory_id: "i1",
    kind: "application",
    item_key: "app:1",
    name: "Slack",
    category_name: "Communication",
    permission: "Regular Member",
    asset_tag: null,
    granted_at: "2026-10-06T08:00:00Z",
    granted_ticket_id: "UAM-2026-000201",
    employee_id: "e1",
    total_count: 1,
    ...over,
  }) as unknown as HeldRow;

const request = (over: Record<string, unknown> = {}) =>
  // Database rows: the generated types call every column non-null.
  ({
    id: "r9",
    ticket_id: "UAM-2026-000150",
    type: "offboarding",
    state: "closed",
    first_name: "Ben",
    last_name: "Ortiz",
    work_email: "ben.ortiz@example.com",
    department: "Sales",
    country: "US",
    effective_date: null,
    last_working_day: "2026-09-30",
    created_at: "2026-09-20T08:00:00Z",
    closed_at: "2026-10-01T08:00:00Z",
    office: "US",
    location: "Texas · Austin",
    nationalities: ["US"],
    total_count: 1,
    people_count: 1,
    ...over,
  }) as unknown as RequestRow;

describe("the data set catalogue", () => {
  test("five data sets; every field key once per set", () => {
    expect(DATASET_KEYS).toEqual([
      "people",
      "access",
      "requests",
      "signatures",
      "offboarding_sla",
    ]);
    for (const key of DATASET_KEYS) {
      const keys = DATASETS[key].fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect(fieldOf("people", "nationalities")?.type).toBe("list");
    expect(fieldOf("signatures", "time_to_approve")?.type).toBe("duration");
    expect(fieldOf("people", "salary")).toBeUndefined();
  });

  test("only People today answers 'holds all / any / none of'", () => {
    expect(DATASET_KEYS.filter((k) => DATASETS[k].holdings)).toEqual([
      "people",
    ]);
  });
});

describe("rows from the report functions", () => {
  test("People today: the person, onboarded, leaving and what they hold", () => {
    const { rows } = peopleRows(
      [employee()],
      [
        held(),
        held({ inventory_id: "i2", name: "Monday.com", permission: null }),
      ],
    );
    expect(rows).toEqual([
      {
        name: "Omar Haddad",
        email: "omar.haddad@example.com",
        department: "Finance",
        office: "Dubai",
        state: null,
        city: null,
        country: "AE",
        nationalities: ["JO"],
        onboarded_at: "2026-10-06T08:00:00Z",
        ticket: "UAM-2026-000201",
        leaving: false,
        leaving_ticket: null,
        holds: ["Slack · Regular Member", "Monday.com"],
      },
    ]);
    expect(holdingLabel({ name: "Laptop", permission: null })).toBe("Laptop");
  });

  test("Access held: one row per item with the person; not employed today = left out", () => {
    const people = peopleRows(
      [
        employee({
          leaving_request_id: "r5",
          leaving_ticket_id: "UAM-2026-000300",
        }),
      ],
      [],
    );
    const rows = accessRows(
      [held(), held({ inventory_id: "i3", employee_id: "gone" })],
      people.byEmployee,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Omar Haddad",
      office: "Dubai",
      kind: "application",
      item: "Slack",
      role: "Regular Member",
      leaving: true,
    });
  });

  test("Requests: state and city from 'State · City'", () => {
    expect(requestRows([request()])[0]).toMatchObject({
      ticket: "UAM-2026-000150",
      type: "offboarding",
      status: "closed",
      name: "Ben Ortiz",
      office: "US",
      state: "Texas",
      city: "Austin",
      last_working_day: "2026-09-30",
    });
    expect(requestRows([request({ location: null })])[0]).toMatchObject({
      state: null,
      city: null,
    });
  });

  test("Signatures: time to approve in seconds; a leaver placed by their latest request", () => {
    const people = peopleRows([employee()], []);
    const persons = personIndex(people.byEmail, requestRows([request()]));
    const sig = {
      id: "r9",
      ticket_id: "UAM-2026-000150",
      type: "offboarding",
      state: "closed",
      first_name: "Ben",
      last_name: "Ortiz",
      work_email: "ben.ortiz@example.com",
      first_signed_at: "2026-09-30T08:00:00Z",
      first_signed_by: "Raju Bholani",
      last_signed_at: "2026-09-30T08:00:00Z",
      it_sha256: "x",
      approved_at: "2026-09-30T20:00:00Z",
      approved_by: "Moises Larez",
      final_sha256: "y",
      returns: 0,
      last_returned_at: null,
      pdf_generated_at: null,
      total_count: 1,
      approved_count: 1,
      returned_count: 0,
      median_seconds: 43200,
    } as unknown as SignatureRow;
    expect(signatureRows([sig], persons)[0]).toMatchObject({
      name: "Ben Ortiz",
      office: "US",
      city: "Austin",
      approved_by: "Moises Larez",
      time_to_approve: 43200,
    });
    // Not signed off yet: no time to approve.
    expect(
      signatureRows(
        [{ ...sig, approved_at: null } as unknown as SignatureRow],
        persons,
      )[0].time_to_approve,
    ).toBeNull();
  });

  test("Offboarding SLA: the result, and name only when nothing places the person", () => {
    const sla = {
      id: "r7",
      ticket_id: "UAM-2026-000160",
      state: "closed",
      first_name: "Mia",
      last_name: "Rossi",
      work_email: "mia.rossi@example.com",
      sla_timeline: "within_24h",
      access_cutoff_at: "2026-09-30T14:00:00Z",
      sla_due_at: "2026-10-01T14:00:00Z",
      removals_total: 5,
      removals_done: 5,
      removed_at: "2026-10-01T09:00:00Z",
      result: "met",
      sla_missed_reason: null,
      total_count: 1,
    } as unknown as SlaRow;
    expect(slaRows([sla], new Map())[0]).toMatchObject({
      ticket: "UAM-2026-000160",
      name: "Mia Rossi",
      office: null,
      timeline: "within_24h",
      result: "met",
      removals_done: 5,
    });
  });

  test("People today wins over an older request for the same email", () => {
    const people = peopleRows([employee()], []);
    const persons = personIndex(
      people.byEmail,
      requestRows([
        request({ work_email: "omar.haddad@example.com", office: "Geneva" }),
      ]),
    );
    expect(persons.get("omar.haddad@example.com")?.office).toBe("Dubai");
  });
});
