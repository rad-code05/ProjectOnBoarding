import { notFound } from "next/navigation";
import { RequestForm } from "@/components/requests/RequestForm";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";
import { loadRequestForm } from "@/lib/requests/form";

export const metadata = { title: "Request" };

/** One request's form. Approvers get 403 here; their read-only view comes later. */
export default async function RequestPage({
  params,
}: PageProps<"/requests/[id]">) {
  await requireRole(...PAGES.requests.roles);
  const { id } = await params;
  const form = await loadRequestForm(id);
  if (!form) notFound();
  // A new state (after Start execution / Cancel) starts a fresh form.
  return <RequestForm key={form.state} form={form} />;
}
