import type { ReactNode } from "react";
import { BrandHeader, BrandPanel } from "./BrandPanel";

/** Split screen for every sign-in related page: brand panel + content on sand. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col lg:flex-row">
      <BrandPanel />
      <BrandHeader />
      <main className="flex flex-1 flex-col justify-between gap-10 px-6 py-8 lg:px-16 lg:py-14">
        <p className="hidden self-end text-[13px] text-graphite lg:block">
          Internal use only
        </p>
        <div className="mx-auto w-full max-w-[400px]">{children}</div>
        <div className="flex justify-between text-xs text-graphite">
          <span>© {new Date().getFullYear()} Laine</span>
          <span>Secured sign-in</span>
        </div>
      </main>
    </div>
  );
}

/** Heading block used at the top of each auth step. */
export function AuthHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <h1 className="font-serif text-[44px] leading-tight">{title}</h1>
      {children && (
        <p className="text-[15px] leading-relaxed text-graphite">{children}</p>
      )}
    </div>
  );
}
