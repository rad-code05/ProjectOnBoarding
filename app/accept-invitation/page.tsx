import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AcceptInvitationForm } from "@/components/auth/AcceptInvitationForm";
import { AuthLayout } from "@/components/auth/AuthLayout";

export const metadata = { title: "Accept invitation" };

/**
 * Where an invitation email's button leads (F18c-2). Public on purpose — the
 * person has no account yet; Clerk's ticket in the address is the proof.
 */
export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ __clerk_ticket?: string | string[] }>;
}) {
  const { userId } = await auth();
  if (userId) redirect("/");
  const { __clerk_ticket: raw } = await searchParams;
  const ticket = typeof raw === "string" && raw.length > 0 ? raw : null;

  return (
    <AuthLayout>
      <AcceptInvitationForm ticket={ticket} />
    </AuthLayout>
  );
}
