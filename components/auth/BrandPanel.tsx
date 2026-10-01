import { Logo } from "@/components/ui";

const steps = ["Prepare", "Execute", "Confirm"];

/** Black brand panel of the sign-in pages (design: Sign-in board). */
export function BrandPanel() {
  return (
    <aside className="hidden w-[620px] shrink-0 flex-col justify-between bg-ink px-16 py-14 text-paper lg:flex">
      <Logo size="lg" />
      <div className="flex flex-col gap-7">
        <p className="text-xs font-semibold tracking-[0.18em] text-stone uppercase">
          Internal · IT Access Management
        </p>
        <p className="font-serif text-7xl leading-[1.02] tracking-tight">
          Laine <span className="font-accent italic">onboarding</span> rights
        </p>
        <div className="h-[3px] w-12 bg-signal" aria-hidden="true" />
        <p className="max-w-md text-[17px] leading-relaxed text-stone">
          Onboarding, offboarding and access changes — prepared, executed and
          confirmed in one traceable record.
        </p>
      </div>
      <ol className="grid grid-cols-3 gap-6 border-t border-divider-dark pt-6">
        {steps.map((step, i) => (
          <li key={step} className="flex flex-col gap-1.5">
            <span className="text-xs text-stone">0{i + 1}</span>
            <span className="text-[15px] font-medium">{step}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** Compact black header used instead of the panel on small screens. */
export function BrandHeader() {
  return (
    <header className="flex flex-col gap-5 bg-ink px-6 pt-8 pb-9 text-paper lg:hidden">
      <Logo size="md" />
      <p className="font-serif text-4xl leading-tight tracking-tight">
        Laine <span className="font-accent italic">onboarding</span> rights
      </p>
      <div className="h-[3px] w-9 bg-signal" aria-hidden="true" />
    </header>
  );
}
