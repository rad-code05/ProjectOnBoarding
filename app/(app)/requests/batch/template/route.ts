import writeXlsxFile from "write-excel-file/node";
import { loadFormOptions } from "@/lib/ai/tools/onboarding-load";
import { requireRole } from "@/lib/auth";
import { templateColumns } from "@/lib/requests/batch/view";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** The example row's roles, where those apps are in the catalog. */
const EXAMPLE_ROLES: Record<string, string> = {
  Slack: "Regular Member",
  "Google Workspace": "Yes",
};

/**
 * The onboarding template (.xlsx): the column titles a batch understands
 * best, bold, then one column per active application (the cell = the role,
 * Raju's layout 2026-10-29), and one example row to overwrite (F17b-3b).
 */
export async function GET() {
  await requireRole("admin", "requester");
  const options = await loadFormOptions(createServerSupabaseClient());
  const apps = options.apps.map((a) => a.name);
  const columns = templateColumns(apps);
  const example = [
    "Meera",
    "Nair",
    "meera.nair@laine.ai",
    "Backend developer",
    "Engineering",
    "Dubai",
    "",
    "",
    "Omar Haddad",
    "02/11/2026",
    "India",
    "Laptop · macOS",
    "Office access (Badge)",
    "Rita Requestor",
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
        'attachment; filename="onboarding-batch-template.xlsx"',
    },
  });
}
