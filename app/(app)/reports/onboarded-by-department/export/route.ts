import type { NextRequest } from "next/server";
import { exportOnboardedBy } from "@/lib/reports/group-export";

/** CSV / PDF of Onboarded by department (audited; see exportOnboardedBy). */
export function GET(request: NextRequest) {
  return exportOnboardedBy(request, "department");
}
