import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The import file kept as evidence (F24c): the exact file that was
 * uploaded, from the private `imports` bucket. Admins only (RLS and the
 * bucket's policy); never cached.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/admin/import/[id]/file">,
) {
  await requireRole("admin");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = createServerSupabaseClient();
  const { data: imp } = await db
    .from("staff_imports")
    .select("file_name, file_path")
    .eq("id", id)
    .maybeSingle();
  if (!imp?.file_path) notFound();
  const { data: file, error } = await db.storage
    .from("imports")
    .download(imp.file_path);
  if (error || !file) notFound();
  // A header carries plain ASCII only: anything else becomes "_".
  const name = imp.file_name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return new Response(file, {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
