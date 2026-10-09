import { CheckIcon, LockIcon } from "@/components/ui";
import type { RequestState } from "@/lib/requests/labels";
import type { SignedSection } from "@/lib/requests/signing";

/**
 * Section 11 once someone has signed: the IT half (Raju, F06) and the
 * approver half (F07). Read-only — signatures are made in Review & sign.
 */
export function SignaturesSection({
  signatures,
  state,
}: {
  signatures: SignedSection[];
  state: RequestState;
}) {
  const halves = [
    { section: "it_execution", title: "IT execution · section 9" },
    { section: "final_confirmation", title: "Final confirmation" },
  ] as const;

  return (
    <section
      id="s11"
      aria-labelledby="s11-title"
      className="flex flex-col gap-3.5 rounded-card border border-line bg-paper p-4 md:col-span-2 md:px-5"
    >
      <div className="flex items-baseline gap-2.5">
        <span className="text-xs font-semibold text-graphite md:text-[11px]">
          11
        </span>
        <h2 id="s11-title" className="font-serif text-[21px] md:text-[19px]">
          Signatures &amp; sign-off
        </h2>
      </div>
      <ul className="flex flex-col gap-2.5 md:grid md:grid-cols-2">
        {halves.map(({ section, title }) => {
          const signed = signatures.find((s) => s.section === section);
          return (
            <li
              key={section}
              className="flex flex-col gap-1 rounded-xl border border-line px-3.5 py-3 text-[13px]"
            >
              <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
                {title}
              </span>
              {signed ? (
                <>
                  <span className="flex items-center gap-2 font-semibold">
                    <CheckIcon size={16} className="shrink-0" />
                    Signed by {signed.signerName}
                  </span>
                  <span className="text-graphite">
                    {signed.signedLabel} · server time
                  </span>
                  <span
                    className="font-mono text-xs break-all text-graphite"
                    title="SHA-256 of what was signed"
                  >
                    Fingerprint {signed.fingerprint.slice(0, 16)}…
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-2 text-graphite">
                  <LockIcon size={16} className="shrink-0" />
                  {state === "pending_confirmation"
                    ? "Waiting for the approver"
                    : "Not signed yet"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
