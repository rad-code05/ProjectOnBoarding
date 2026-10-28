import "server-only";
import { loadFormOptions } from "@/lib/ai/tools/onboarding-load";
import { COMPANY_TIMEZONE } from "@/lib/requests/format";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { ServerSupabase } from "@/lib/supabase/server";
import { zonedParts } from "@/lib/time/zoned";
import type { BatchRecord } from "./columns";
import {
  checkOnboardingBatch,
  type BatchContext,
  type CheckedRow,
  type Problem,
} from "./onboarding";

/**
 * Batches in the database (F17b-3a): made from a read list, every row
 * checked (and checked again after each change — a duplicate in one row
 * flags another), Confirm through `create_batch_drafts()`. Every call runs
 * with the person's own session (RLS: own batches, admin / requester); the
 * `db` is passed in so the assistant can use its own client (F17b-4).
 */

type RequestType = Database["public"]["Enums"]["request_type"];

export type BatchRowData = {
  values: Record<string, string>;
  other: Record<string, string>;
};

export type BatchRow = {
  id: string;
  position: number;
  included: boolean;
  data: BatchRowData;
  problems: Problem[];
  requestId: string | null;
  ticketId: string | null;
};

export type Batch = {
  id: string;
  type: RequestType;
  title: string;
  source: "file" | "paste" | "chat";
  fileName: string | null;
  status: "open" | "created";
  createdAt: string;
  confirmedAt: string | null;
  rows: BatchRow[];
};

/** Only onboarding batches until F17b-5. */
export function batchTypeReady(type: RequestType) {
  return type === "onboarding";
}

async function context(
  db: ServerSupabase,
  emails: string[],
): Promise<BatchContext> {
  const [options, settings, open] = await Promise.all([
    loadFormOptions(db),
    db.from("app_settings").select("company_timezone").maybeSingle(),
    emails.length
      ? db
          .from("requests")
          .select("work_email")
          .in("work_email", emails)
          .not("state", "in", "(closed,cancelled)")
      : Promise.resolve({ data: [] as { work_email: string | null }[] }),
  ]);
  const timeZone = settings.data?.company_timezone ?? COMPANY_TIMEZONE;
  return {
    options,
    today: zonedParts(new Date().toISOString(), timeZone).date,
    openEmails: new Set(
      (open.data ?? [])
        .map((r) => (r.work_email ?? "").toLowerCase())
        .filter(Boolean),
    ),
  };
}

const emailsOf = (rows: { values: Record<string, string> }[]) => [
  ...new Set(
    rows
      .map((r) => r.values.workEmail?.trim().toLowerCase())
      .filter((e): e is string => Boolean(e)),
  ),
];

async function checkAll(
  db: ServerSupabase,
  rows: { position: number; values: Record<string, string> }[],
): Promise<Map<number, CheckedRow>> {
  return checkOnboardingBatch(rows, await context(db, emailsOf(rows)));
}

/** A new batch from a read list; returns its id. */
export async function makeBatch(
  db: ServerSupabase,
  input: {
    type: RequestType;
    title: string;
    source: "file" | "paste" | "chat";
    fileName?: string | null;
    records: BatchRecord[];
  },
): Promise<string> {
  if (!batchTypeReady(input.type)) {
    throw new Error("Batches of leavers and role changes come next.");
  }
  const { data: batch, error } = await db
    .from("request_batches")
    .insert({
      type: input.type,
      title: input.title.trim().slice(0, 200) || "Batch",
      source: input.source,
      file_name: input.fileName?.slice(0, 200) ?? null,
    })
    .select("id")
    .single();
  if (error || !batch) throw new Error(error?.message ?? "batch not saved");
  const checked = await checkAll(db, input.records);
  const { error: rowsError } = await db.from("request_batch_rows").insert(
    input.records.map((r) => {
      const c = checked.get(r.position);
      return {
        batch_id: batch.id,
        position: r.position,
        data: { values: r.values, other: r.other } as NonNullable<Json>,
        writes: (c?.writes ?? []) as NonNullable<Json>,
        problems: (c?.problems ?? []) as NonNullable<Json>,
      };
    }),
  );
  if (rowsError) {
    await db.from("request_batches").delete().eq("id", batch.id);
    throw new Error(rowsError.message);
  }
  return batch.id;
}

/** The batch with its rows (and each created draft's ticket); null when not one's own. */
export async function loadBatch(
  db: ServerSupabase,
  id: string,
): Promise<Batch | null> {
  const { data: b } = await db
    .from("request_batches")
    .select(
      "id, type, title, source, file_name, status, created_at, confirmed_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!b) return null;
  const { data: rows } = await db
    .from("request_batch_rows")
    .select(
      "id, position, included, data, problems, request_id, request:requests(ticket_id)",
    )
    .eq("batch_id", id)
    .order("position");
  return {
    id: b.id,
    type: b.type,
    title: b.title,
    source: b.source as Batch["source"],
    fileName: b.file_name,
    status: b.status as Batch["status"],
    createdAt: b.created_at,
    confirmedAt: b.confirmed_at,
    rows: (rows ?? []).map((r) => {
      const data = (r.data ?? {}) as Partial<BatchRowData>;
      return {
        id: r.id,
        position: r.position,
        included: r.included,
        data: { values: data.values ?? {}, other: data.other ?? {} },
        problems: (r.problems ?? []) as Problem[],
        requestId: r.request_id,
        ticketId:
          (r.request as { ticket_id: string } | null)?.ticket_id ?? null,
      };
    }),
  };
}

/** Every row checked again; only rows whose result changed are written. */
export async function recheckBatch(db: ServerSupabase, batchId: string) {
  const { data: rows, error } = await db
    .from("request_batch_rows")
    .select("id, position, data, writes, problems")
    .eq("batch_id", batchId);
  if (error) throw new Error(error.message);
  const list = (rows ?? []).map((r) => ({
    ...r,
    values: ((r.data ?? {}) as Partial<BatchRowData>).values ?? {},
  }));
  const checked = await checkAll(db, list);
  for (const r of list) {
    const c = checked.get(r.position);
    if (!c) continue;
    if (
      JSON.stringify(c.writes) === JSON.stringify(r.writes) &&
      JSON.stringify(c.problems) === JSON.stringify(r.problems)
    )
      continue;
    const { error: e } = await db
      .from("request_batch_rows")
      .update({
        writes: c.writes as NonNullable<Json>,
        problems: c.problems as NonNullable<Json>,
      })
      .eq("id", r.id);
    if (e) throw new Error(e.message);
  }
}

/** A fixed row (new cells and / or Include), then the whole batch re-checked. */
export async function saveBatchRow(
  db: ServerSupabase,
  rowId: string,
  change: { values?: Record<string, string>; included?: boolean },
): Promise<string> {
  const { data: row, error } = await db
    .from("request_batch_rows")
    .select("batch_id, data")
    .eq("id", rowId)
    .single();
  if (error || !row) throw new Error(error?.message ?? "row not found");
  const update: Database["public"]["Tables"]["request_batch_rows"]["Update"] =
    {};
  if (change.values) {
    const data = (row.data ?? {}) as Partial<BatchRowData>;
    const values = Object.fromEntries(
      Object.entries(change.values)
        .map(([k, v]) => [k, v.trim().slice(0, 500)] as const)
        .filter(([, v]) => v !== ""),
    );
    update.data = { values, other: data.other ?? {} } as NonNullable<Json>;
  }
  if (change.included !== undefined) update.included = change.included;
  const { error: e } = await db
    .from("request_batch_rows")
    .update(update)
    .eq("id", rowId);
  if (e) throw new Error(e.message);
  if (change.values) await recheckBatch(db, row.batch_id);
  return row.batch_id;
}

/** The person's batches, newest first (kept 7 days). */
export async function listMyBatches(db: ServerSupabase) {
  const { data } = await db
    .from("request_batches")
    .select("id, type, title, status, created_at, request_batch_rows(count)")
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((b) => ({
    id: b.id,
    type: b.type,
    title: b.title,
    status: b.status as Batch["status"],
    createdAt: b.created_at,
    rows:
      (b.request_batch_rows as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}

export type CreatedDraft = {
  position: number;
  request_id: string;
  ticket_id: string;
};

/**
 * Confirm: checks once more with the latest data (someone may have opened a
 * request meanwhile), then the database creates every draft or none.
 */
export async function confirmBatch(
  db: ServerSupabase,
  batchId: string,
): Promise<
  { ok: true; created: CreatedDraft[] } | { ok: false; message: string }
> {
  await recheckBatch(db, batchId);
  const { data, error } = await db.rpc("create_batch_drafts", {
    p_batch_id: batchId,
  });
  if (error) {
    if (error.code === "23505" || error.code === "22023") {
      return {
        ok: false,
        message: `Nothing was created: ${error.message.replace(/^row (\d+):/, "row $1 —")}. Fix it and confirm again.`,
      };
    }
    if (error.code === "42501") {
      return { ok: false, message: "This batch can't be created any more." };
    }
    return {
      ok: false,
      message:
        "Could not create the drafts. Check your connection and try again.",
    };
  }
  return { ok: true, created: (data ?? []) as unknown as CreatedDraft[] };
}
