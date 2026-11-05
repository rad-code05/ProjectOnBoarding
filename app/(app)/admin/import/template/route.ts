import writeXlsxFile from "write-excel-file/node";
import { loadFormOptions } from "@/lib/ai/tools/onboarding-load";
import { requireRole } from "@/lib/auth";
import { importTemplateColumns } from "@/lib/staff-import/columns";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** The example row's roles, where those apps are in the catalog. */
const EXAMPLE_ROLES: Record<string, string> = {
  Slack: "Regular Member",
  "Google Workspace": "Yes",
};

/**
 * The staff import template (.xlsx, F24b): the person's columns (start date
 * and, for leavers, leave date — the only dates the app takes from a file),
 * then one column per active application (the cell = the role; empty = not
 * held). Bold titles and one invented example row to overwrite. Admin only.
 */
export async function GET() {
  await requireRole("admin");
  const options = await loadFormOptions(createServerSupabaseClient());
  const columns = importTemplateColumns(options.apps.map((a) => a.name));
  const example = [
    "Lucas",
    "Moreau",
    "lucas.moreau@laine.ai",
    "Backend developer",
    "Engineering",
    "Dubai",
    "",
    "",
    "France",
    "Omar Haddad",
    "06/01/2025",
    "",
    "",
    ...options.apps.map((a) => {
      const role = EXAMPLE_ROLES[a.name];
      if (!role) return "";
      return role === "Yes" || a.permissions.includes(role) ? role : "Yes";
    }),
  ];
  const file = await writeXlsxFile(
    [columns.map((value) => ({ value, fontWeight: "bold" as const })), example],
    {
      columns: columns.map((c) => ({ width: Math.max(14, c.length + 4) })),
      stickyRowsCount: 1,
    },
  ).toBuffer();
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="staff-import-template.xlsx"',
    },
  });
}
