"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { NewBackupCodesSheet } from "./NewBackupCodesSheet";
import { NewPhoneSheet } from "./NewPhoneSheet";

const card = "flex flex-col gap-3 rounded-card border border-line bg-paper p-4";

/**
 * "Authenticator app" and "Backup codes" on Password & MFA (design: Phone ·
 * Password & MFA). `totpOn` comes from the server; once Clerk has loaded in
 * the browser its live value is used.
 */
export function MfaCards({ totpOn: serverTotpOn }: { totpOn: boolean }) {
  const { user } = useUser();
  const router = useRouter();
  const [sheet, setSheet] = useState<"phone" | "codes" | null>(null);
  const totpOn = user ? user.totpEnabled : serverTotpOn;

  return (
    <>
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
          {totpOn
            ? "Codes from your authenticator app are needed at every sign-in. Got a new phone? Move it here — you'll scan a new QR code."
            : "Your account has no authenticator app. Set one up now — it is needed at every sign-in."}
        </p>
        <Button
          variant="secondary"
          aria-haspopup="dialog"
          className="md:self-start"
          onClick={() => setSheet("phone")}
        >
          {totpOn ? "Set up on a new phone" : "Set up authenticator app"}
        </Button>
      </section>

      <section aria-labelledby="codes-title" className={card}>
        <h2 id="codes-title" className="font-serif text-[21px]">
          Backup codes
        </h2>
        <p className="text-sm leading-relaxed text-graphite">
          One-time codes for when your phone isn&apos;t with you. Making new
          ones stops the old ones working.
        </p>
        <Button
          variant="secondary"
          aria-haspopup="dialog"
          className="md:self-start"
          disabled={!totpOn}
          onClick={() => setSheet("codes")}
        >
          Make new backup codes
        </Button>
        {!totpOn && (
          <p className="text-xs text-graphite">
            Set up the authenticator app first.
          </p>
        )}
      </section>

      {sheet === "phone" && (
        <NewPhoneSheet
          onClose={(changed) => {
            setSheet(null);
            if (changed) router.refresh();
          }}
        />
      )}
      {sheet === "codes" && (
        <NewBackupCodesSheet onClose={() => setSheet(null)} />
      )}
    </>
  );
}
