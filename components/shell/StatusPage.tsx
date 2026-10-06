import Link from "next/link";
import { buttonStyles } from "@/components/ui";

export type StatusPageProps = {
  /** HTTP-style code shown large, e.g. "403". */
  code: string;
  /** Small label above, e.g. "not allowed". */
  label: string;
  title: string;
  message: string;
  action: { href: string; label: string };
};

/** Centered card for 403 / 404 (States board in design/records-states.md). */
export function StatusPage({
  code,
  label,
  title,
  message,
  action,
}: StatusPageProps) {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-[14px] border border-line bg-paper p-6 text-center">
      <span className="self-start text-[11px] font-bold tracking-[0.12em] text-graphite uppercase">
        {code} · {label}
      </span>
      <span className="font-serif text-[56px] leading-none" aria-hidden="true">
        {code}
      </span>
      <h1 className="font-serif text-[22px]">{title}</h1>
      <p className="max-w-[280px] text-[13px] leading-normal text-graphite">
        {message}
      </p>
      <Link href={action.href} className={buttonStyles("secondary", "sm")}>
        {action.label}
      </Link>
    </section>
  );
}
