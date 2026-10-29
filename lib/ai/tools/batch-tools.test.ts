// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Batch } from "@/lib/requests/batch/store";

vi.mock("server-only", () => ({}));
const store = {
  makeBatch: vi.fn(),
  loadBatch: vi.fn(),
  saveBatchRow: vi.fn(),
  confirmBatch: vi.fn(),
};
vi.mock("@/lib/requests/batch/store", () => ({
  makeBatch: (...a: unknown[]) => store.makeBatch(...a),
  loadBatch: (...a: unknown[]) => store.loadBatch(...a),
  saveBatchRow: (...a: unknown[]) => store.saveBatchRow(...a),
  confirmBatch: (...a: unknown[]) => store.confirmBatch(...a),
}));

const { proposeBatch } = await import("./propose-batch");
const { getBatch } = await import("./get-batch");
const { fixBatchRow } = await import("./fix-batch-row");
const { createBatchDrafts } = await import("./create-batch-drafts");
const { personCells, batchSummary, confirmMismatch } =
  await import("./batch-shared");

const ID = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
const ctx = {
  userId: "user_1",
  roles: ["admin" as const],
  timeZone: "Asia/Dubai",
  db: {} as never,
};
const run = (t: { build: (c: typeof ctx) => unknown }, input: unknown) =>
  (
    t.build(ctx) as { execute: (i: unknown, o: unknown) => Promise<unknown> }
  ).execute(input, { toolCallId: "1", messages: [] }) as Promise<
    Record<string, unknown>
  >;

const row = (
  position: number,
  values: Record<string, string>,
  extra: Partial<Batch["rows"][number]> = {},
): Batch["rows"][number] => ({
  id: `row-${position}`,
  position,
  included: true,
  data: { values, other: {} },
  problems: [],
  requestId: null,
  ticketId: null,
  ...extra,
});

const batch = (
  rows: Batch["rows"],
  status: Batch["status"] = "open",
): Batch => ({
  id: ID,
  type: "onboarding",
  title: "Joiners",
  source: "chat",
  fileName: null,
  status,
  createdAt: "2026-10-29T08:00:00Z",
  confirmedAt: null,
  rows,
});

const FOUR = batch([
  row(1, { firstName: "Meera", lastName: "Nair", department: "Engineering" }),
  row(
    2,
    { firstName: "Abdul", lastName: "Rahman", department: "Engeneering" },
    {
      problems: [
        { field: "department", message: '"Engeneering" isn\'t a department' },
      ],
    },
  ),
  row(3, { firstName: "Sara", lastName: "Lopez" }, { included: false }),
  row(4, { firstName: "Tom", lastName: "Becker" }),
]);

beforeEach(() => {
  for (const f of Object.values(store)) f.mockReset();
});

describe("batch cells from the chat (F17b-4)", () => {
  test("lists are joined like a file's cells; empty values left out", () => {
    expect(
      personCells({
        firstName: "Meera",
        lastName: "Nair",
        workEmail: "",
        applications: ["Slack (Regular Member)", "Google Workspace"],
        nationalities: ["India", "Switzerland"],
        access: ["Office door (Dubai)"],
        equipment: [],
      }),
    ).toEqual({
      firstName: "Meera",
      lastName: "Nair",
      applications: "Slack (Regular Member), Google Workspace",
      nationalities: "India; Switzerland",
      physical: "Office door (Dubai)",
    });
  });

  test("the summary: counts, who is ready, why the others aren't; cells fenced as data", () => {
    const s = batchSummary(FOUR);
    expect(s).toMatchObject({
      batchId: ID,
      link: `/requests/batch/${ID}`,
      people: 4,
      ready: 2,
      needAttention: 1,
      leftOut: 1,
      readyNames: ["Meera Nair", "Tom Becker"],
      notCreated: [
        { name: "Abdul Rahman", why: "Department" },
        { name: "Sara Lopez", why: "left out" },
      ],
    });
    expect(s.rows).toMatch(/^<untrusted-data source="batch rows">/);
    expect(s.rows).toContain("Engeneering");
  });

  test("the Confirm names must be exactly the batch's", () => {
    const s = batchSummary(FOUR);
    expect(
      confirmMismatch(
        s,
        ["tom becker", "Meera  Nair"],
        ["Abdul Rahman", "Sara Lopez"],
      ),
    ).toBeNull();
    expect(
      confirmMismatch(
        s,
        ["Meera Nair", "Tom Becker", "Abdul Rahman"],
        ["Sara Lopez"],
      ),
    ).toMatch(/don't match the batch/);
    expect(
      confirmMismatch(batchSummary(batch([row(1, {})], "created")), [], []),
    ).toMatch(/already created/);
    expect(
      confirmMismatch(
        batchSummary(batch([FOUR.rows[1]])),
        [],
        ["Abdul Rahman"],
      ),
    ).toMatch(/No row is ready/);
  });
});

describe("the batch tools", () => {
  test("proposeBatch makes the person's own batch from the chat and reads it back", async () => {
    store.makeBatch.mockResolvedValue(ID);
    store.loadBatch.mockResolvedValue(FOUR);
    const out = await run(proposeBatch, {
      title: "Joiners 2 November",
      people: [
        { firstName: "Meera", lastName: "Nair", startDate: "2026-11-02" },
        { firstName: "Tom", lastName: "Becker", applications: ["Slack"] },
      ],
    });
    expect(store.makeBatch).toHaveBeenCalledWith(ctx.db, {
      type: "onboarding",
      title: "Joiners 2 November",
      source: "chat",
      records: [
        {
          position: 1,
          values: {
            firstName: "Meera",
            lastName: "Nair",
            startDate: "2026-11-02",
          },
          other: {},
        },
        {
          position: 2,
          values: {
            firstName: "Tom",
            lastName: "Becker",
            applications: "Slack",
          },
          other: {},
        },
      ],
    });
    expect(out).toMatchObject({ people: 4, ready: 2 });
  });

  test("getBatch: only the person's own batches", async () => {
    store.loadBatch.mockResolvedValue(null);
    expect(await run(getBatch, { batchId: ID })).toMatchObject({
      error: expect.stringMatching(/No such batch/),
    });
  });

  test("fixBatchRow changes only the told cells, or leaves the row out", async () => {
    store.loadBatch.mockResolvedValue(FOUR);
    await run(fixBatchRow, {
      batchId: ID,
      row: 2,
      cells: { department: "Engineering", jobTitle: "" },
    });
    expect(store.saveBatchRow).toHaveBeenCalledWith(ctx.db, "row-2", {
      values: {
        firstName: "Abdul",
        lastName: "Rahman",
        department: "Engineering",
      },
      included: undefined,
    });
    await run(fixBatchRow, { batchId: ID, row: 3, included: true });
    expect(store.saveBatchRow).toHaveBeenLastCalledWith(ctx.db, "row-3", {
      values: undefined,
      included: true,
    });
    expect(
      await run(fixBatchRow, { batchId: ID, row: 9, included: false }),
    ).toEqual({ error: "The batch has no row 9." });
    store.loadBatch.mockResolvedValue(batch(FOUR.rows, "created"));
    expect(
      await run(fixBatchRow, { batchId: ID, row: 1, included: false }),
    ).toMatchObject({ error: expect.stringMatching(/already created/) });
  });

  test("createBatchDrafts waits for Confirm; the precheck refuses wrong names", async () => {
    expect(createBatchDrafts.needsApproval).toBe(true);
    store.loadBatch.mockResolvedValue(FOUR);
    const good = {
      batchId: ID,
      create: ["Meera Nair", "Tom Becker"],
      notCreated: ["Abdul Rahman", "Sara Lopez"],
    };
    expect(await createBatchDrafts.precheck!(good, ctx)).toBeNull();
    expect(
      await createBatchDrafts.precheck!(
        { ...good, create: ["Meera Nair"] },
        ctx,
      ),
    ).toMatch(/Call again with create = \["Meera Nair","Tom Becker"\]/);

    store.confirmBatch.mockResolvedValue({
      ok: true,
      created: [
        { position: 1, request_id: "r1", ticket_id: "UAM-2026-000101" },
        { position: 4, request_id: "r4", ticket_id: "UAM-2026-000102" },
      ],
    });
    const out = await run(createBatchDrafts, good);
    expect(store.confirmBatch).toHaveBeenCalledWith(ctx.db, ID);
    expect(out).toMatchObject({
      created: true,
      drafts: 2,
      link: `/requests/batch/${ID}`,
    });
  });

  test("createBatchDrafts creates nothing when the batch changed after the card", async () => {
    store.loadBatch.mockResolvedValue(FOUR);
    const out = await run(createBatchDrafts, {
      batchId: ID,
      create: ["Meera Nair"],
      notCreated: ["Abdul Rahman", "Sara Lopez", "Tom Becker"],
    });
    expect(store.confirmBatch).not.toHaveBeenCalled();
    expect(out).toMatchObject({ created: false });
  });
});
