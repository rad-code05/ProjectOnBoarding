"use client";

import { useSession } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthHeading } from "./AuthLayout";
import { SetupMfa } from "./SetupMfa";

/** Shows whatever Clerk still needs after sign-in (only MFA setup today). */
export function SessionTasks() {
  const { isLoaded, session } = useSession();
  const router = useRouter();
  const task = session?.currentTask?.key;

  useEffect(() => {
    if (isLoaded && session && !task) router.replace("/");
  }, [isLoaded, session, task, router]);

  if (!isLoaded) return <p className="text-graphite">Loading…</p>;

  if (!session) {
    return (
      <div className="flex flex-col gap-6">
        <AuthHeading title="Session ended">
          Please sign in again to continue.
        </AuthHeading>
        <Link href="/sign-in" className="font-semibold">
          Go to sign in
        </Link>
      </div>
    );
  }

  if (task === "setup-mfa") return <SetupMfa />;

  if (task) {
    return (
      <AuthHeading title="One more step">
        Your account needs attention before you can continue ({task}). Contact
        Raju.
      </AuthHeading>
    );
  }

  return <p className="text-graphite">Redirecting…</p>;
}
