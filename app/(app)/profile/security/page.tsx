import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { ChangePasswordCard } from "@/components/profile/ChangePasswordCard";
import { ChevronLeftIcon, buttonStyles } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Password & MFA" };

const card = "flex flex-col gap-3 rounded-card border border-line bg-paper p-4";

/** Every signed-in user manages their own password and MFA here. */
export default async function SecurityPage() {
  await requireUser();
  const user = await currentUser();
  const totpOn = Boolean(user?.totpEnabled);

  // Placeholder until the next part of F05c (new phone, new backup codes).
  const later = (label: string) => (
    <span
      aria-disabled="true"
      title="Coming with the next part of F05c"
      className={`${buttonStyles("secondary", "md")} cursor-not-allowed opacity-60 md:self-start`}
    >
      {label}
    </span>
  );

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

      <section aria-labelledby="mfa-title" className={card}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="mfa-title" className="font-serif text-[21px]">
            Authenticator app
          </h2>
          <span
            className={`rounded-pill px-2.5 py-1 text-[11px] font-bold ${totpOn ? "bg-ink text-paper" : "bg-sand text-graphite"}`}
          >
            {totpOn ? "On" : "Off"}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-graphite">
          Codes from your authenticator app are needed at every sign-in. Got a
          new phone? Move it here — you&apos;ll scan a new QR code.
        </p>
        {later("Set up on a new phone")}
      </section>

      <section aria-labelledby="codes-title" className={card}>
        <h2 id="codes-title" className="font-serif text-[21px]">
          Backup codes
        </h2>
        <p className="text-sm leading-relaxed text-graphite">
          One-time codes for when your phone isn&apos;t with you. Making new
          ones stops the old ones working.
        </p>
        {later("Make new backup codes")}
      </section>

      <p className="text-xs text-graphite">
        Lost your phone and your backup codes? Contact Raju to reset your
        sign-in.
      </p>
    </div>
  );
}
