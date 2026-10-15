import { describe, expect, test } from "vitest";
import {
  describeEvent,
  eventChanges,
  eventFacts,
  type RawAuditEvent,
} from "./describe";

const raju = { actor_id: "user_raju", actor_name: "Raju Bholani" };
const moises = { actor_id: "user_moises", actor_name: "Moises Larez" };
const T = "UAM-2026-000141";

const ev = (
  event: Partial<RawAuditEvent> & { action: string },
): RawAuditEvent => ({
  source: "user",
  actor_id: null,
  actor_name: null,
  diff: {},
  ...event,
});

describe("describeEvent — the board's examples", () => {
  test("downloaded, confirmed, signed, changed", () => {
    expect(
      describeEvent(
        ev({
          ...moises,
          action: "record.downloaded",
          ticket_id: T,
          diff: {
            file_name: "anna.keller-access-modification.pdf",
            ticket_id: T,
          },
        }),
      ),
    ).toEqual({
      who: "Moises Larez",
      what: "downloaded anna.keller-access-modification.pdf",
      context: T,
      chip: "People",
    });
    expect(
      describeEvent(
        ev({
          ...moises,
          action: "request.confirmed",
          ticket_id: T,
          request_type: "access_modification",
          employee_name: "Anna Keller",
        }),
      ),
    ).toMatchObject({
      what: `confirmed, signed and closed ${T}`,
      context: "Access modification · Anna Keller",
    });
    expect(
      describeEvent(
        ev({
          ...raju,
          action: "request.signed",
          ticket_id: T,
          diff: { snapshot_sha256: "5d20a9e1ffff", note: null },
        }),
      ),
    ).toMatchObject({
      what: `signed ${T} (Review & sign)`,
      context: "fingerprint 5d20a9e1…",
    });
    expect(
      describeEvent(
        ev({
          ...raju,
          action: "request.access_changed",
          ticket_id: T,
          diff: {
            app: "Figma",
            before: { action: "Grant", permission: "Editor", notes: null },
            after: {
              action: "Modify",
              permission: "Admin",
              notes: "Design system library",
            },
          },
        }),
      ),
    ).toMatchObject({
      what: `changed Figma on ${T} — Editor → Admin`,
      context: "section 5",
    });
  });

  test("system events, inventory, access change start, retired app", () => {
    expect(
      describeEvent(
        ev({
          action: "inventory.updated",
          source: "system",
          ticket_id: T,
          employee_name: "Anna Keller",
          diff: { added: 1, ended: 2, request_id: "x", ticket_id: T },
        }),
      ),
    ).toEqual({
      who: "System",
      what: "updated Anna Keller's access inventory — 1 added, 2 ended",
      context: T,
      chip: "System",
    });
    expect(
      describeEvent(
        ev({
          ...raju,
          action: "request.access_change_started",
          ticket_id: T,
          employee_name: "Anna Keller",
          diff: { held: 12, employee_id: "e" },
        }),
      ),
    ).toMatchObject({
      what: `started the access change ${T} for Anna Keller`,
      context: "12 items on record",
    });
    expect(
      describeEvent(
        ev({
          ...raju,
          action: "catalog.app_retired",
          diff: { name: "Old CRM" },
        }),
      ),
    ).toMatchObject({
      what: "retired the application “Old CRM”",
      context: "Admin → Applications",
    });
    expect(
      describeEvent(ev({ ...moises, action: "session.created" })).what,
    ).toBe("signed in");
  });

  test("on the request's own timeline the ticket is left out", () => {
    const opts = { ref: null };
    expect(
      describeEvent(
        ev({ ...moises, action: "request.confirmed", ticket_id: T }),
        opts,
      ).what,
    ).toBe("confirmed, signed and closed it");
    expect(
      describeEvent(
        ev({
          ...moises,
          action: "request.returned",
          ticket_id: T,
          diff: { flagged_sections: [5] },
        }),
        opts,
      ),
    ).toMatchObject({
      what: "returned it to IT",
      context: "flagged section 5",
    });
    expect(
      describeEvent(
        ev({
          ...raju,
          action: "request.created",
          diff: { type: "onboarding" },
        }),
        opts,
      ).what,
    ).toBe("created the onboarding");
    expect(
      describeEvent(
        ev({
          ...raju,
          action: "request.state_changed",
          diff: { from: "draft", to: "in_execution" },
        }),
        opts,
      ).what,
    ).toBe("started execution of it");
  });

  test("accounts, roles and unknown actions", () => {
    const people = { user_celine: "Celine Example" };
    expect(
      describeEvent(
        ev({
          action: "role.granted",
          source: "system",
          entity_id: "user_celine",
          diff: { role: "it_operator" },
        }),
        { people },
      ).what,
    ).toBe("gave Celine Example the IT operator role");
    expect(
      describeEvent(
        ev({
          actor_id: "user_gone",
          actor_email: "gone@example.test",
          action: "session.removed",
        }),
      ).who,
    ).toBe("gone@example.test");
    expect(
      describeEvent(ev({ ...raju, action: "dev.something_happened" })).what,
    ).toBe("recorded “dev.something_happened”");
  });
});

describe("eventChanges / eventFacts — the details sheet", () => {
  test("changed fields only, before → after", () => {
    expect(
      eventChanges(
        ev({
          action: "request.access_changed",
          diff: {
            app: "Figma",
            before: { action: "Grant", permission: "Editor", notes: null },
            after: {
              action: "Modify",
              permission: "Admin",
              notes: "Design system library",
            },
          },
        }),
      ),
    ).toEqual([
      { field: "Action", before: "Grant", after: "Modify" },
      { field: "Permission", before: "Editor", after: "Admin" },
      { field: "Notes", before: "—", after: "Design system library" },
    ]);
  });

  test("request details and section 9 answers", () => {
    expect(
      eventChanges(
        ev({
          action: "request.updated",
          diff: {
            ticket_id: T,
            changes: { job_title: { before: "Analyst", after: "Lead" } },
          },
        }),
      ),
    ).toEqual([{ field: "Job title", before: "Analyst", after: "Lead" }]);
    expect(
      eventChanges(
        ev({
          action: "request.execution_updated",
          diff: {
            before: { checks: { access_provisioned: null }, notes: null },
            after: {
              checks: {
                access_provisioned: true,
                devices_enrolled: "no_change",
              },
              notes: null,
            },
          },
        }),
      ),
    ).toEqual([
      { field: "Section 9 · Access provisioned", before: "—", after: "Yes" },
      {
        field: "Section 9 · Devices enrolled",
        before: "—",
        after: "No changes made",
      },
    ]);
  });

  test("single values, added items and the other stored values", () => {
    expect(
      eventChanges(
        ev({
          action: "request.mailbox_set",
          diff: { before: null, after: "no_mailbox" },
        }),
      ),
    ).toEqual([
      { field: "Mailbox", before: "—", after: "No mailbox to convert" },
    ]);
    const added = ev({
      action: "request.access_added",
      diff: {
        app: "Slack",
        action: "Grant",
        permission: "Member",
        notes: null,
      },
    });
    expect(eventChanges(added)).toEqual([
      { field: "Application", before: "—", after: "Slack" },
      { field: "Action", before: "—", after: "Grant" },
      { field: "Permission", before: "—", after: "Member" },
    ]);
    expect(eventFacts(added)).toEqual([]);
    expect(
      eventFacts(
        ev({
          action: "record.downloaded",
          diff: {
            ticket_id: T,
            file_name: "a.b-onboarding.pdf",
            sha256: "abc",
          },
        }),
      ),
    ).toEqual([
      { label: "File", value: "a.b-onboarding.pdf" },
      { label: "Fingerprint (SHA-256)", value: "abc" },
    ]);
  });

  test("state, removed items, sign-ins and internal IDs", () => {
    const cancelled = ev({
      action: "request.state_changed",
      diff: {
        ticket_id: T,
        from: "in_execution",
        to: "cancelled",
        reason: "Duplicate",
      },
    });
    expect(eventChanges(cancelled)).toEqual([
      { field: "State", before: "In execution", after: "Cancelled" },
    ]);
    expect(eventFacts(cancelled)).toEqual([
      { label: "Reason", value: "Duplicate" },
    ]);
    expect(
      eventChanges(
        ev({
          action: "request.access_removed",
          diff: { app: "Slack", action: "Remove", permission: null },
        }),
      ),
    ).toEqual([
      { field: "Application", before: "Slack", after: "—" },
      { field: "Action", before: "Remove", after: "—" },
    ]);
    const signIn = ev({
      action: "session.created",
      diff: { status: "active", client_id: "client_1", webhook_id: "msg_1" },
    });
    expect(eventChanges(signIn)).toEqual([]);
    expect(eventFacts(signIn)).toEqual([{ label: "Status", value: "active" }]);
    expect(
      describeEvent(
        ev({
          ...raju,
          action: "request.access_changed",
          diff: {
            app: "Slack",
            before: { action: "Grant", permission: null },
            after: { action: "Grant", permission: "Member" },
          },
        }),
        { ref: null },
      ).what,
    ).toBe("changed Slack — Member");
  });
});
