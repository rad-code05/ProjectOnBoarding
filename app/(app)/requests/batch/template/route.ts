import writeXlsxFile from "write-excel-file/node";
import { requireRole } from "@/lib/auth";
import { TEMPLATE_COLUMNS } from "@/lib/requests/batch/view";

/**
 * The onboarding template (.xlsx): the column titles a batch understands
 * best, bold, and one example row to overwrite (F17b-3b).
 */
export async function GET() {
  await requireRole("admin", "requester");
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
    "Slack (Regular Member), Google Workspace (User)",
    "Laptop · macOS",
    "Office access (Badge)",
    "Rita Requestor",
  ];
  const file = await writeXlsxFile(
    [
      TEMPLATE_COLUMNS.map((value) => ({ value, fontWeight: "bold" as const })),
      example,
    ],
    {
      columns: TEMPLATE_COLUMNS.map((c) => ({
        width: Math.max(14, c.length + 4),
      })),
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
