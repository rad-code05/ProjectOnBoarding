import { notFound } from "next/navigation";
import { RequestActivity } from "@/components/audit/RequestActivity";
import { RequestForm } from "@/components/requests/RequestForm";
import { loadRequestActivity } from "@/lib/audit/activity";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { loadRequestForm } from "@/lib/requests/form";
import { displayTimezone } from "@/lib/time/display";

export const metadata = { title: "Request" };

/** One request's form. Approvers get 403 here; their read-only view comes later. */
export default async function RequestPage({
  params,
}: PageProps<"/requests/[id]">) {
  const { roles } = await requireRole(...PAGES.requests.roles);
  const { id } = await params;
  const [form, activity, timeZone] = await Promise.all([
    loadRequestForm(id),
    loadRequestActivity(id),
    displayTimezone(),
  ]);
  if (!form) notFound();
  // A new state (after Start execution / Cancel) starts a fresh form.
  // Only an IT operator or admin signs section 9 (the database says the same).
  const canSign = roles.some(
    (role) => role === "admin" || role === "it_operator",
  );
  return (
    <div className="flex flex-col gap-6">
      <RequestForm
        key={form.state}
        form={form}
        canSign={canSign}
        canAddCities={roles.includes("admin")}
      />
      {activity && (
        <RequestActivity
          entries={activity}
          timeZone={timeZone}
          showAuditLink={PAGES.audit.roles.some((r) => roles.includes(r))}
          // Under the form column on desktop (the section menu is on the left).
          className="md:ml-[15.25rem]"
        />
      )}
    </div>
  );
}
