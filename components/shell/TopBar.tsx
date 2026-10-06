"use client";

import { useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Avatar, IconButton, Logo, SignOutIcon } from "@/components/ui";
import { cn } from "@/lib/cn";

export type TopBarProps = {
  /** Already filtered by role on the server (navFor). */
  items: { href: string; label: string }[];
  userName: string;
  userRole: string;
};

/**
 * Black bar on every signed-in page: logo, app name, menu, user block, sign-out.
 * Client component because the active item follows the URL (layouts don't
 * re-render on navigation).
 */
export function TopBar({ items, userName, userRole }: TopBarProps) {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-6 bg-ink px-7 text-paper">
      <Logo size="sm" />
      <div className="h-5 w-px bg-divider-dark" aria-hidden="true" />
      <span className="font-serif text-[17px] whitespace-nowrap">
        Laine onboarding rights
      </span>
      <nav aria-label="Main" className="ml-2 flex gap-1 self-stretch">
        {items.map((item) => {
          const current =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex items-center border-b-2 px-3 text-[13px] transition-colors",
                current
                  ? "border-signal font-semibold text-paper"
                  : "border-transparent font-medium text-stone hover:text-paper",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <Link
        href="/profile"
        aria-label={`My profile: ${userName}`}
        className="flex items-center gap-2.5"
      >
        <Avatar name={userName} decorative />
        <span className="flex flex-col gap-px">
          <span className="text-xs font-semibold text-paper">{userName}</span>
          <span className="text-[10px] text-stone">{userRole}</span>
        </span>
      </Link>
      <IconButton
        label="Sign out"
        variant="dark"
        size="sm"
        icon={<SignOutIcon />}
        disabled={signingOut}
        onClick={async () => {
          setSigningOut(true);
          await signOut({ redirectUrl: "/sign-in" });
        }}
      />
    </header>
  );
}
