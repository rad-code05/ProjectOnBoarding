import Link from "next/link";
import { NewBatchForm } from "@/components/requests/batch/NewBatchForm";
import { ChevronLeftIcon } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "New batch" };

/** New batch (F17b-3b, board *Phone · New batch*): admin and requester. */
export default async function NewBatchPage() {
  await requireRole("admin", "requester");
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        href="/requests"
        className="-ml-2 flex h-11 items-center gap-1 self-start px-2 text-sm font-semibold"
      >
        <ChevronLeftIcon size={18} />
        Requests
      </Link>
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
          Batch · prepared with the assistant
        </span>
        <h1 className="font-serif text-[32px] leading-tight">New batch</h1>
        <p className="text-[13px] leading-normal text-graphite">
          Several people at once. Nothing is created until you check the list
          and press <strong className="text-ink">Confirm</strong>.
        </p>
      </div>
      <NewBatchForm />
    </div>
  );
}
