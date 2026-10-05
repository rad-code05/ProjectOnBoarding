import { currentUser } from "@clerk/nextjs/server";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { getCurrentUser } from "@/lib/auth";

const ROLE_LABELS = {
  admin: "Administrator",
  requester: "Requester",
  it_operator: "IT operator",
  approver: "Approver",
  auditor: "Auditor",
} as const;

/** Temporary signed-in start page — replaced by the app shell in S7. */
export default async function Home() {
  const { roles } = await getCurrentUser();
  const user = await currentUser();
  const name = user?.firstName ?? user?.primaryEmailAddress?.emailAddress;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-serif text-5xl tracking-tight">
        Laine <span className="font-accent italic">onboarding</span> rights
      </h1>
      <div className="h-[3px] w-12 bg-signal" aria-hidden="true" />
      <p className="text-graphite">
        Signed in as <strong className="text-ink">{name}</strong>.{" "}
        {roles.length > 0 ? (
          <>
            Roles:{" "}
            <strong className="text-ink">
              {roles.map((role) => ROLE_LABELS[role]).join(", ")}
            </strong>
            .
          </>
        ) : (
          <>No roles yet — contact Raju.</>
        )}{" "}
        The app shell arrives in S7.
      </p>
      <SignOutButton />
    </main>
  );
}
