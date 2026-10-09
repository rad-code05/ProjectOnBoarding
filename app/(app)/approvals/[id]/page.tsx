import { currentUser } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ApprovalView } from "@/components/approvals/ApprovalView";
import { loadApprovalReview } from "@/lib/approvals/review";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "Confirm request" };

/** One request for the approver (read-only), with Confirm & sign / Return. */
export default async function ApprovalPage({
  params,
}: PageProps<"/approvals/[id]">) {
  await requireRole(...PAGES.approvals.roles);
  const { id } = await params;
  const [review, user] = await Promise.all([
    loadApprovalReview(id),
    currentUser(),
  ]);
  if (!review) notFound();
  const signerName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "You";
  return <ApprovalView review={review} signerName={signerName} />;
}
