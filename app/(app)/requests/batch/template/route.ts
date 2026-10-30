import type { NextRequest } from "next/server";
import writeXlsxFile from "write-excel-file/node";
import { loadFormOptions } from "@/lib/ai/tools/onboarding-load";
import { requireRole } from "@/lib/auth";
import { BATCH_FIELDS } from "@/lib/requests/batch/columns";
import {
  CHANGE_EXAMPLE,
  CHANGE_TEMPLATE,
  LEAVER_EXAMPLE,
  LEAVER_TEMPLATE,
  templateColumns,
} from "@/lib/requests/batch/view";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** The example row's roles, where those apps are in the catalog. */
const EXAMPLE_ROLES: Record<string, string> = {
  Slack: "Regular Member",
  "Google Workspace": "Yes",
};

/** The onboarding template: the person's columns, then one per active application. */
async function onboarding() {
  const options = await loadFormOptions(createServerSupabaseClient());
  const apps = options.apps.map((a) => a.name);
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
  return { columns: templateColumns(apps), example };
}

/**
 * The batch templates (.xlsx): the column titles a batch understands best,
 * bold, and one example row to overwrite. Onboarding (F17b-3b): one column
 * per active application (the cell = the role, Raju's layout 2026-10-29).
 * Offboarding (F17b-5b): `?kind=offboarding`; access change (F17b-5c):
 * `?kind=access_modification`.
 */
export async function GET(request: NextRequest) {
  await requireRole("admin", "requester");
  const kind = request.nextUrl.searchParams.get("kind");
  const { name, columns, example } =
    kind === "offboarding"
      ? {
          name: "offboarding",
          columns: LEAVER_TEMPLATE,
          example: BATCH_FIELDS.offboarding.map((f) => LEAVER_EXAMPLE[f.key]),
        }
      : kind === "access_modification"
        ? {
            name: "access-change",
            columns: CHANGE_TEMPLATE,
            example: BATCH_FIELDS.access_modification.map(
              (f) => CHANGE_EXAMPLE[f.key],
            ),
          }
        : { name: "onboarding", ...(await onboarding()) };
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
      "Content-Disposition": `attachment; filename="${name}-batch-template.xlsx"`,
    },
  });
}
