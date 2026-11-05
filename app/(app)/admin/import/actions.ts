"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireRole } from "@/lib/auth";
import { BatchReadError } from "@/lib/requests/batch/table";
import { readImportFile } from "@/lib/staff-import/read";
import {
  confirmImport,
  makeImport,
  saveImportRow,
} from "@/lib/staff-import/store";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Admin → Import (F24c): the buttons of the import pages. Admins only (the
 * database says so too — RLS and `import_staff()`); every write runs with
 * the admin's own session.
 */

export type ImportResult =
  { ok: true; id: string } | { ok: false; message: string };

const idSchema = z.uuid();
const valuesSchema = z.record(z.string().max(60), z.string().max(500));

const CONTENT_TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

/** A new import from the uploaded file: read, kept as evidence, every person checked. */
export async function uploadImport(form: FormData): Promise<ImportResult> {
  await requireRole("admin");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, message: "Choose the import file (.xlsx or .csv)." };
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const records = await readImportFile(file.name, bytes);
    const id = await makeImport(createServerSupabaseClient(), {
      fileName: file.name,
      bytes,
      contentType: CONTENT_TYPES[extension] ?? "text/plain",
      records,
    });
    revalidatePath("/admin/import");
    return { ok: true, id };
  } catch (error) {
    if (error instanceof BatchReadError)
      return { ok: false, message: error.message };
    return {
      ok: false,
      message: "Could not read the file. Check your connection and try again.",
    };
  }
}

/** A fixed row: its cells (the whole import is checked again). */
export async function saveImportRowValues(
  rowId: string,
  values: Record<string, string>,
): Promise<ImportResult> {
  await requireRole("admin");
  const id = idSchema.safeParse(rowId);
  const v = valuesSchema.safeParse(values);
  if (!id.success || !v.success)
    return { ok: false, message: "This row can't be saved." };
  try {
    const importId = await saveImportRow(
      createServerSupabaseClient(),
      id.data,
      {
        values: v.data,
      },
    );
    return { ok: true, id: importId };
  } catch {
    return { ok: false, message: "This row can't be changed any more." };
  }
}

/** Include or leave out a row. */
export async function setImportRowIncluded(
  rowId: string,
  included: boolean,
): Promise<ImportResult> {
  await requireRole("admin");
  const id = idSchema.safeParse(rowId);
  if (!id.success || typeof included !== "boolean")
    return { ok: false, message: "This row can't be saved." };
  try {
    const importId = await saveImportRow(
      createServerSupabaseClient(),
      id.data,
      {
        included,
      },
    );
    return { ok: true, id: importId };
  } catch {
    return { ok: false, message: "This row can't be changed any more." };
  }
}

/** Discard an open import (nothing imported; kept, read-only). */
export async function discardImport(importId: string): Promise<ImportResult> {
  await requireRole("admin");
  const id = idSchema.safeParse(importId);
  if (!id.success) return { ok: false, message: "This import is unknown." };
  const { error } = await createServerSupabaseClient().rpc(
    "discard_staff_import",
    { p_import: id.data },
  );
  if (error)
    return { ok: false, message: "Could not discard the import. Try again." };
  revalidatePath("/admin/import");
  return { ok: true, id: id.data };
}

/** Confirm: every ready row imported, all or nothing. */
export async function confirmStaffImport(
  importId: string,
): Promise<ImportResult> {
  await requireRole("admin");
  const id = idSchema.safeParse(importId);
  if (!id.success) return { ok: false, message: "This import is unknown." };
  const r = await confirmImport(createServerSupabaseClient(), id.data);
  if (!r.ok) return r;
  revalidatePath("/admin/import");
  return { ok: true, id: id.data };
}
