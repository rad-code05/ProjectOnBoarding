import { currentUser } from "@clerk/nextjs/server";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { requireUser } from "@/lib/auth";

/** Temporary signed-in start page — replaced by the app shell in S7. */
export default async function Home() {
  await requireUser();
  const user = await currentUser();
  const name = user?.firstName ?? user?.primaryEmailAddress?.emailAddress;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-serif text-5xl tracking-tight">
        Laine <span className="font-accent italic">onboarding</span> rights
      </h1>
      <div className="h-[3px] w-12 bg-signal" aria-hidden="true" />
      <p className="text-graphite">
        Signed in as <strong className="text-ink">{name}</strong>. The app shell
        arrives in S7.
      </p>
      <SignOutButton />
    </main>
  );
}
