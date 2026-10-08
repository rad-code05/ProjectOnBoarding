import Link from "next/link";
import { createDraft } from "@/app/(app)/requests/actions";
import { buttonStyles } from "@/components/ui";
import { NewRequestButton } from "./NewRequestButton";

function HappyRobot() {
  return (
    <svg width="72" height="72" viewBox="0 0 64 64" aria-hidden="true">
      <line
        x1="32"
        y1="7"
        x2="32"
        y2="15"
        stroke="var(--color-ink)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="32" cy="6" r="4.5" fill="var(--color-signal)" />
      <rect
        x="5"
        y="29"
        width="7"
        height="14"
        rx="3.5"
        fill="var(--color-ink)"
      />
      <rect
        x="52"
        y="29"
        width="7"
        height="14"
        rx="3.5"
        fill="var(--color-ink)"
      />
      <rect
        x="10"
        y="14"
        width="44"
        height="40"
        rx="17"
        fill="var(--color-ink)"
      />
      <rect
        x="16"
        y="21"
        width="32"
        height="24"
        rx="11"
        fill="var(--color-sand)"
      />
      <circle cx="25" cy="32" r="3" fill="var(--color-ink)" />
      <circle cx="39" cy="32" r="3" fill="var(--color-ink)" />
      <path
        d="M27 38.5 Q32 42 37 38.5"
        stroke="var(--color-ink)"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** First day: nothing to list yet — offer the first request. */
export function NoRequestsYet() {
  return (
    <section className="flex flex-col items-center gap-3.5 rounded-card border border-line bg-paper px-6 py-10 text-center">
      <HappyRobot />
      <h2 className="font-serif text-2xl">No requests yet</h2>
      <p className="max-w-[280px] text-sm leading-normal text-graphite">
        Start the first onboarding. You can save it as a draft and come back to
        it at any time.
      </p>
      <form action={createDraft}>
        <NewRequestButton />
      </form>
    </section>
  );
}

/** Filters left nothing — say so and offer the way back. */
export function NoMatchingRequests() {
  return (
    <section className="flex flex-col items-center gap-2 rounded-card border border-line bg-paper px-6 py-8 text-center">
      <h2 className="font-serif text-xl">No requests match</h2>
      <p className="text-sm text-graphite">
        Try another search or fewer filters.
      </p>
      <Link href="/requests" className={buttonStyles("secondary", "sm")}>
        Clear filters
      </Link>
    </section>
  );
}
