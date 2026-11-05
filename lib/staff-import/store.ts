import "server-only";
import { loadFormOptions } from "@/lib/ai/tools/onboarding-load";
import type { BatchRecord } from "@/lib/requests/batch/columns";
import { withAppColumns, type Problem } from "@/lib/requests/batch/onboarding";
import { companyToday } from "@/lib/requests/batch/store";
import type { Json } from "@/lib/supabase/database.types";
import type { ServerSupabase } from "@/lib/supabase/server";
import { checkImport, type ImportContext, type ImportPerson } from "./check";

/**
 * Staff imports in the database (F24b): made from the uploaded file — the
 * file itself kept in the private `imports` bucket as evidence, each person
 * checked and saved as a row; Confirm is `import_staff()` (F24c). Admins
 * only (RLS); every call runs with the admin's own session.
 */

export type ImportRowData = {
  values: Record<string, string>;
  other: Record<string, string>;
  /** Why the row is left out on its own (already in the app). */
  skipped?: string | null;
};

export type StaffImportRow = {
  id: string;
  position: number;
  included: boolean;
  data: ImportRowData;
  person: ImportPerson;
  problems: Problem[];
  onboardingRequestId: string | null;
  offboardingRequestId: string | null;
};

export type StaffImport = {
  id: string;
  fileName: string;
  filePath: string | null;
  status: "open" | "imported" | "discarded";
  counts: {
    people?: number;
    leavers?: number;
    access?: number;
    left_out?: number;
  };
  createdAt: string;
  finishedAt: string | null;
  createdBy: string;
  rows: StaffImportRow[];
};

/** A file name safe in a storage path: letters, digits, . _ - only. */
export function storageName(fileName: string): string {
  const clean = fileName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-120);
  return clean || "import";
}

/** Work emails already in the app (any request, imported ones too) → the latest ticket. */
async function inApp(db: ServerSupabase, emails: string[]) {
  const found = new Map<string, string>();
  for (let i = 0; i < emails.length; i += 100) {
    const { data, error } = await db
      .from("requests")
      .select("work_email, ticket_id, created_at")
      .in("work_email", emails.slice(i, i + 100))
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    for (const r of data ?? [])
      if (r.work_email) found.set(r.work_email.toLowerCase(), r.ticket_id);
  }
  return found;
}

async function context(
  db: ServerSupabase,
  rows: { values: Record<string, string> }[],
): Promise<ImportContext> {
  const emails = [
    ...new Set(
      rows
        .map((r) => r.values.workEmail?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e)),
    ),
  ];
  const [options, { today }, known] = await Promise.all([
    loadFormOptions(db),
    companyToday(db),
    inApp(db, emails),
  ]);
  return { options, today, inApp: known };
}

/**
 * A new import from a read file: the import row, the file stored as
 * evidence, then every person checked and saved. Returns the import's id.
 */
export async function makeImport(
  db: ServerSupabase,
  input: {
    fileName: string;
    bytes: Uint8Array;
    contentType: string;
    records: BatchRecord[];
  },
): Promise<string> {
  const { data: made, error } = await db
    .from("staff_imports")
    .insert({ file_name: input.fileName.slice(0, 200) })
    .select("id")
    .single();
  if (error || !made) throw new Error(error?.message ?? "import not saved");

  try {
    await fill(db, made.id, input);
  } catch (cause) {
    // Never leave a half-made import open: drop it (kept, read-only).
    await db.rpc("discard_staff_import", { p_import: made.id });
    throw cause;
  }
  return made.id;
}

/** The file stored as evidence, then every person checked and saved. */
async function fill(
  db: ServerSupabase,
  id: string,
  input: {
    fileName: string;
    bytes: Uint8Array;
    contentType: string;
    records: BatchRecord[];
  },
) {
  const path = `${id}/${storageName(input.fileName)}`;
  const upload = await db.storage.from("imports").upload(path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);
  const named = await db
    .from("staff_imports")
    .update({ file_path: path })
    .eq("id", id);
  if (named.error) throw new Error(named.error.message);

  const options = await loadFormOptions(db);
  // One column per application (the template) joins the Applications cell.
  const records = input.records.map((r) => ({
    position: r.position,
    ...withAppColumns(r, options.apps),
  }));
  const checked = checkImport(records, await context(db, records));
  const { error: rowsError } = await db.from("staff_import_rows").insert(
    records.map((r) => {
      const c = checked.get(r.position);
      const data: ImportRowData = {
        values: r.values,
        other: r.other,
        skipped: c?.skipped ?? null,
      };
      return {
        import_id: id,
        position: r.position,
        included: !c?.skipped,
        data: data as NonNullable<Json>,
        person: (c?.person ?? { access: [] }) as NonNullable<Json>,
        problems: (c?.problems ?? []) as NonNullable<Json>,
      };
    }),
  );
  if (rowsError) throw new Error(rowsError.message);
}

/** One import with its rows; null when not found (or not an admin). */
export async function loadImport(
  db: ServerSupabase,
  id: string,
): Promise<StaffImport | null> {
  const { data: imp } = await db
    .from("staff_imports")
    .select(
      "id, file_name, file_path, status, counts, created_at, finished_at, maker:app_users!staff_imports_created_by_fkey(first_name, last_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!imp) return null;
  const { data: rows, error } = await db
    .from("staff_import_rows")
    .select(
      "id, position, included, data, person, problems, onboarding_request_id, offboarding_request_id",
    )
    .eq("import_id", id)
    .order("position");
  if (error) throw new Error(error.message);
  return {
    id: imp.id,
    fileName: imp.file_name,
    filePath: imp.file_path,
    status: imp.status as StaffImport["status"],
    counts: (imp.counts ?? {}) as StaffImport["counts"],
    createdAt: imp.created_at,
    finishedAt: imp.finished_at,
    createdBy: [imp.maker?.first_name, imp.maker?.last_name]
      .filter(Boolean)
      .join(" "),
    rows: (rows ?? []).map((r) => {
      const data = (r.data ?? {}) as Partial<ImportRowData>;
      return {
        id: r.id,
        position: r.position,
        included: r.included,
        data: {
          values: data.values ?? {},
          other: data.other ?? {},
          skipped: data.skipped ?? null,
        },
        person: (r.person ?? { access: [] }) as unknown as ImportPerson,
        problems: (r.problems ?? []) as unknown as Problem[],
        onboardingRequestId: r.onboarding_request_id,
        offboardingRequestId: r.offboarding_request_id,
      };
    }),
  };
}

/** Earlier imports, newest first (Admin → Import). */
export async function listImports(db: ServerSupabase) {
  const { data, error } = await db
    .from("staff_imports")
    .select(
      "id, file_name, status, counts, created_at, finished_at, maker:app_users!staff_imports_created_by_fkey(first_name, last_name), staff_import_rows(count)",
    )
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []).map((i) => ({
    id: i.id,
    fileName: i.file_name,
    status: i.status as StaffImport["status"],
    counts: (i.counts ?? {}) as StaffImport["counts"],
    createdAt: i.created_at,
    finishedAt: i.finished_at,
    createdBy: [i.maker?.first_name, i.maker?.last_name]
      .filter(Boolean)
      .join(" "),
    rows:
      (i.staff_import_rows as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}
