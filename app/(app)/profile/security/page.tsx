import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { ChangePasswordCard } from "@/components/profile/ChangePasswordCard";
import { MfaCards } from "@/components/profile/MfaCards";
import { ChevronLeftIcon } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Password & MFA" };

/** Every signed-in user manages their own password and MFA here. */
export default async function SecurityPage() {
  await requireUser();
  const user = await currentUser();
  const totpOn = Boolean(user?.totpEnabled);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link
        href="/profile"
        className="flex items-center gap-1 self-start text-sm font-semibold"
      >
        <ChevronLeftIcon size={18} />
        My profile
      </Link>
      <h1 className="font-serif text-[34px] leading-tight">
        Password &amp; MFA
      </h1>

      <ChangePasswordCard />

      <MfaCards totpOn={totpOn} />

      <p className="text-xs text-graphite">
        Lost your phone and your backup codes? Contact Raju to reset your
        sign-in.
      </p>
    </div>
  );
}
