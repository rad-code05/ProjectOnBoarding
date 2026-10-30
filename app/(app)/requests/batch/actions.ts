"use server";

import * as z from "zod";
import { requireRole } from "@/lib/auth";
import { readBatchFile, readPastedList } from "@/lib/requests/batch/read-file";
import {
  batchTypeReady,
  confirmBatch,
  makeBatch,
  saveBatchDefaults,
  saveBatchRow,
  type CreatedDraft,
} from "@/lib/requests/batch/store";
import { BatchReadError } from "@/lib/requests/batch/table";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Batch requests (F17b-3a): the buttons of the batch pages. Admin and
 * requester only (the database says so too — own batches, RLS); every
 * write runs with the person's own session.
 */

export type BatchResult =
  | { ok: true; id: string }
  | { ok: false; message: string; needsAssistant?: boolean };

const typeSchema = z.enum(["onboarding", "offboarding", "access_modification"]);
const idSchema = z.uuid();
const valuesSchema = z.record(z.string().max(60), z.string().max(500));

const SOON =
  "Batches of role changes come next — for now, start them one by one.";

function failed(error: unknown): { ok: false; message: string } {
  if (error instanceof BatchReadError)
    return { ok: false, message: error.message };
  return {
    ok: false,
    message: "Could not read the list. Check your connection and try again.",
  };
}

/** New batch from an uploaded .xlsx / .csv. */
export async function readBatchUpload(form: FormData): Promise<BatchResult> {
  await requireRole("admin", "requester");
  const type = typeSchema.safeParse(form.get("type"));
  const file = form.get("file");
  if (!type.success || !(file instanceof File)) {
    return { ok: false, message: "Choose the kind of requests and a file." };
  }
  if (!batchTypeReady(type.data)) return { ok: false, message: SOON };
  try {
    const read = await readBatchFile(
      file.name,
      new Uint8Array(await file.arrayBuffer()),
      type.data,
    );
    if (read.kind !== "table")
      return { ok: false, message: "The file has no table." };
    const id = await makeBatch(createServerSupabaseClient(), {
      type: type.data,
      title: file.name,
      source: "file",
      fileName: file.name,
      records: read.records,
    });
    return { ok: true, id };
  } catch (error) {
    return failed(error);
  }
}

/** New batch from a pasted list (a table — free text goes to the assistant). */
export async function readBatchPaste(
  kind: string,
  text: string,
): Promise<BatchResult> {
  await requireRole("admin", "requester");
  const type = typeSchema.safeParse(kind);
  if (!type.success || typeof text !== "string") {
    return {
      ok: false,
      message: "Choose the kind of requests and paste a list.",
    };
  }
  if (!batchTypeReady(type.data)) return { ok: false, message: SOON };
  try {
    const read = readPastedList(text, type.data);
    if (read.kind === "text") {
      return {
        ok: false,
        needsAssistant: true,
        message:
          "This list has no column titles. Paste it with a title row (copy the cells from Excel), or give it to the Laine assistant to read.",
      };
    }
    const id = await makeBatch(createServerSupabaseClient(), {
      type: type.data,
      title: "Pasted list",
      source: "paste",
      records: read.records,
    });
    return { ok: true, id };
  } catch (error) {
    return failed(error);
  }
}

/** A fixed row: its cells (the whole batch is checked again). */
export async function saveBatchRowValues(
  rowId: string,
  values: Record<string, string>,
): Promise<BatchResult> {
  await requireRole("admin", "requester");
  const id = idSchema.safeParse(rowId);
  const v = valuesSchema.safeParse(values);
  if (!id.success || !v.success)
    return { ok: false, message: "This row can't be saved." };
  try {
    const batchId = await saveBatchRow(createServerSupabaseClient(), id.data, {
      values: v.data,
    });
    return { ok: true, id: batchId };
  } catch {
    return { ok: false, message: "This row can't be changed any more." };
  }
}

/** Leavers: "the same for everyone" (every row is checked again). */
export async function saveLeaverDefaults(
  batchId: string,
  defaults: Record<string, string>,
): Promise<BatchResult> {
  await requireRole("admin", "requester");
  const id = idSchema.safeParse(batchId);
  const v = valuesSchema.safeParse(defaults);
  if (!id.success || !v.success)
    return { ok: false, message: "These values can't be saved." };
  try {
    await saveBatchDefaults(createServerSupabaseClient(), id.data, v.data);
    return { ok: true, id: id.data };
  } catch {
    return { ok: false, message: "This batch can't be changed any more." };
  }
}

/** Include or leave out a row. */
export async function setBatchRowIncluded(
  rowId: string,
  included: boolean,
): Promise<BatchResult> {
  await requireRole("admin", "requester");
  const id = idSchema.safeParse(rowId);
  if (!id.success || typeof included !== "boolean") {
    return { ok: false, message: "This row can't be saved." };
  }
  try {
    const batchId = await saveBatchRow(createServerSupabaseClient(), id.data, {
      included,
    });
    return { ok: true, id: batchId };
  } catch {
    return { ok: false, message: "This row can't be changed any more." };
  }
}

/** Discard an open batch (nothing was created). */
export async function discardBatch(batchId: string): Promise<BatchResult> {
  await requireRole("admin", "requester");
  const id = idSchema.safeParse(batchId);
  if (!id.success) return { ok: false, message: "This batch is unknown." };
  const { error } = await createServerSupabaseClient()
    .from("request_batches")
    .delete()
    .eq("id", id.data)
    .eq("status", "open");
  if (error)
    return { ok: false, message: "Could not discard the batch. Try again." };
  return { ok: true, id: id.data };
}

/** Confirm: one draft per included, ready row — all or nothing. */
export async function confirmBatchDrafts(
  batchId: string,
): Promise<
  { ok: true; created: CreatedDraft[] } | { ok: false; message: string }
> {
  await requireRole("admin", "requester");
  const id = idSchema.safeParse(batchId);
  if (!id.success) return { ok: false, message: "This batch is unknown." };
  return confirmBatch(createServerSupabaseClient(), id.data);
}
