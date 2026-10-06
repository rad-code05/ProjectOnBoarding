import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { getCurrentUser } from "@/lib/auth";
import { landingFor } from "@/lib/navigation";

/**
 * "/" sends each person to their start page (Raju → Requests, approver →
 * Approvals). Without any role there's nowhere to go, so we say so.
 */
export default async function Home() {
  const { roles } = await getCurrentUser();
  const landing = landingFor(roles);
  if (landing) {
    redirect(landing);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-serif text-4xl tracking-tight">
        You don&apos;t have a role yet
      </h1>
      <div className="h-[3px] w-12 bg-signal" aria-hidden="true" />
      <p className="max-w-sm text-sm text-graphite">
        Your account works, but no role has been given to it. Contact Raju to
        get access.
      </p>
      <SignOutButton />
    </main>
  );
}
