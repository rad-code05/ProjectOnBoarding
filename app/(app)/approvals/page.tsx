import Link from "next/link";
import { Avatar, SummaryTile, buttonStyles } from "@/components/ui";
import { loadApprovals, type WaitingRequest } from "@/lib/approvals/list";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "Approvals" };

const heading = "font-serif text-[22px] md:text-[24px]";

function WaitingCard({ request }: { request: WaitingRequest }) {
  const facts = [
    { label: "Ticket", value: request.ticketId, strong: true },
    { label: "Effective", value: request.effective },
    { label: "Access", value: request.access },
    { label: "Signed by IT", value: request.signedByIt },
  ];
  return (
    <li className="flex flex-col gap-2.5 rounded-card border border-line bg-paper p-3.5">
      <div className="flex items-center gap-2.5">
        <Avatar name={request.name} decorative />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="text-[15px] font-bold">{request.name}</h3>
          <span className="text-xs text-graphite">{request.role || "—"}</span>
        </div>
        <span className="rounded-pill border border-ink px-2.5 py-1 text-[11px] font-bold">
          {request.type}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        {facts.map((fact) => (
          <div key={fact.label} className="contents">
            <dt className="text-graphite">{fact.label}</dt>
            <dd className={fact.strong ? "font-semibold" : undefined}>
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
      <Link
        href={`/approvals/${request.id}`}
        className={`${buttonStyles("primary", "md")} md:self-start`}
      >
        Review &amp; confirm
      </Link>
    </li>
  );
}

/** Moises's landing page (design: Moises · Approvals + Phone · Approvals). */
export default async function ApprovalsPage() {
  await requireRole(...PAGES.approvals.roles);
  const { waiting, returnedCount, closedThisMonth, recentlyClosed } =
    await loadApprovals();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
          Approver
        </span>
        <h1 className="font-serif text-[34px] leading-tight">Approvals</h1>
        <p className="text-sm text-graphite">
          Requests Raju has completed and signed, waiting for your confirmation.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 md:max-w-xl md:gap-3">
        <SummaryTile label="Waiting for you" value={waiting.length} />
        <SummaryTile label="Returned to Raju" value={returnedCount} />
        <SummaryTile label="Closed this month" value={closedThisMonth} />
      </div>

      <section
        aria-labelledby="waiting-title"
        className="flex flex-col gap-2.5"
      >
        <h2 id="waiting-title" className={heading}>
          Waiting for you
        </h2>
        {waiting.length > 0 ? (
          <ul className="flex flex-col gap-2.5 md:grid md:grid-cols-2">
            {waiting.map((request) => (
              <WaitingCard key={request.id} request={request} />
            ))}
          </ul>
        ) : (
          <p className="rounded-card border border-line bg-paper px-4 py-5 text-sm text-graphite">
            Nothing is waiting for you. When Raju signs a request, it appears
            here.
          </p>
        )}
      </section>

      <section aria-labelledby="closed-title" className="flex flex-col gap-2">
        <h2 id="closed-title" className={heading}>
          Recently closed
        </h2>
        {recentlyClosed.length > 0 ? (
          <ul className="rounded-card border border-line bg-paper">
            {recentlyClosed.map((request) => (
              <li
                key={request.id}
                className="flex flex-col gap-0.5 border-b border-line-subtle px-3.5 py-3 last:border-0"
              >
                <span className="text-sm font-semibold">{request.name}</span>
                <span className="text-xs text-graphite">
                  {request.ticketId} · closed {request.closed}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-graphite">Nothing closed yet.</p>
        )}
      </section>

      <p className="text-xs text-graphite">
        You can confirm or return requests, view reports and export records.
        Creating and editing requests is done by IT.
      </p>
    </div>
  );
}
