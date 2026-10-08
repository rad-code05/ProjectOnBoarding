/**
 * Section 4 — Provisioning method. Until RBAC templates exist (decision D17,
 * Admin · Templates in F21) every request is "Custom / exception": each app
 * is listed in section 5.
 */
export function ProvisioningSection() {
  return (
    <section
      id="s4"
      aria-labelledby="s4-title"
      className="flex flex-col gap-3 rounded-card border border-line bg-paper p-4 md:col-span-2 md:px-5"
    >
      <div className="flex items-baseline gap-2.5">
        <span className="text-xs font-semibold text-graphite md:text-[11px]">
          04
        </span>
        <h2 id="s4-title" className="font-serif text-[21px] md:text-[19px]">
          Provisioning method
        </h2>
      </div>
      <fieldset className="flex flex-col gap-2 md:flex-row">
        <legend className="sr-only">Provisioning method</legend>
        <label className="flex flex-1 items-start gap-3 rounded-xl border-2 border-ink px-3.5 py-3">
          <input
            type="radio"
            name="provisioning"
            defaultChecked
            className="mt-0.5 size-5 shrink-0 accent-ink"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-bold md:text-[13px]">
              Custom / exception
            </span>
            <span className="text-[13px] leading-snug text-graphite md:text-xs">
              Every app is listed below. Use when access differs from the
              approved RBAC.
            </span>
          </span>
        </label>
        <label className="flex flex-1 items-start gap-3 rounded-xl border border-line px-3.5 py-3 text-graphite">
          <input
            type="radio"
            name="provisioning"
            disabled
            className="mt-0.5 size-5 shrink-0"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold md:text-[13px]">
              RBAC template
            </span>
            <span className="text-[13px] leading-snug md:text-xs">
              Role templates come later (Admin · Templates).
            </span>
          </span>
        </label>
      </fieldset>
    </section>
  );
}
