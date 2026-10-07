"use client";

import { useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Avatar,
  ChevronRightIcon,
  CloseIcon,
  IconButton,
  Logo,
  MenuIcon,
  SignOutIcon,
} from "@/components/ui";
import { cn } from "@/lib/cn";

export type TopBarProps = {
  /** Already filtered by role on the server (navFor). */
  items: { href: string; label: string }[];
  userName: string;
  userRole: string;
};

/**
 * Black bar on every signed-in page. Mobile-first (D22): on phones a compact
 * bar with a menu button that opens a full-screen menu; from `md` (768px) the
 * desktop bar with the menu inline. Client component because the active item
 * follows the URL (layouts don't re-render on navigation).
 */
export function TopBar({ items, userName, userRole }: TopBarProps) {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const [signingOut, setSigningOut] = useState(false);
  // The menu belongs to the page it was opened on: once navigation reaches a
  // new page it is closed automatically. (Closing it inside the link's click
  // removed the link mid-navigation, which slow browsers could cancel.)
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const menuOpen = menuOpenOn === pathname;
  const closeMenu = () => setMenuOpenOn(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const firstMenuLink = useRef<HTMLAnchorElement>(null);

  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut({ redirectUrl: "/sign-in" });
  };

  // While the phone menu is open: focus its first link, stop the page behind
  // it from scrolling, and let Esc close it (focus returns to the button).
  useEffect(() => {
    if (!menuOpen) return;
    firstMenuLink.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpenOn(null);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <>
      <header className="relative z-50 flex h-14 shrink-0 items-center gap-3 bg-ink pr-2 pl-4 text-paper md:h-15 md:gap-6 md:px-7">
        <Logo size="sm" />
        <div className="h-4.5 w-px shrink-0 bg-divider-dark md:h-5" />
        <span className="min-w-0 flex-1 truncate font-serif text-base md:flex-none md:text-[17px]">
          <span className="md:hidden">Onboarding rights</span>
          <span className="hidden md:inline">Laine onboarding rights</span>
        </span>

        <nav
          aria-label="Main"
          className="ml-2 hidden gap-1 self-stretch md:flex"
        >
          {items.map((item) => {
            const current = isCurrent(item.href);
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
        <div className="hidden flex-1 md:block" />

        <Link
          href="/profile"
          aria-label={`My profile: ${userName}`}
          className="flex size-11 shrink-0 items-center justify-center md:size-auto md:gap-2.5"
        >
          <Avatar name={userName} decorative />
          <span className="hidden flex-col gap-px md:flex">
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
          onClick={handleSignOut}
          className="hidden md:inline-flex"
        />
        <button
          ref={menuButton}
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="phone-menu"
          onClick={() => setMenuOpenOn(menuOpen ? null : pathname)}
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-pill border border-divider-dark bg-ink text-paper hover:border-stone md:hidden"
        >
          {menuOpen ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
        </button>
      </header>

      {menuOpen && (
        <div
          id="phone-menu"
          className="fixed inset-x-0 top-14 bottom-0 z-40 flex flex-col overflow-y-auto bg-ink px-4 pt-5 pb-6 text-paper md:hidden"
        >
          <nav aria-label="Main" className="flex flex-col">
            {items.map((item, index) => {
              const current = isCurrent(item.href);
              return (
                <Link
                  key={item.href}
                  ref={index === 0 ? firstMenuLink : undefined}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  // Same page: no navigation will close the menu, so close it.
                  onClick={current ? closeMenu : undefined}
                  className={cn(
                    "flex min-h-15 items-center justify-between border-b border-divider-dark font-serif text-[28px] leading-tight",
                    current ? "text-paper" : "text-stone hover:text-paper",
                  )}
                >
                  {item.label}
                  {current && (
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-pill bg-signal"
                    />
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto flex flex-col gap-4 pt-8">
            <Link
              href="/profile"
              onClick={isCurrent("/profile") ? closeMenu : undefined}
              className="flex min-h-14 items-center gap-3"
            >
              <Avatar name={userName} size="md" decorative />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{userName}</span>
                <span className="text-xs text-stone">
                  {userRole} · My profile
                </span>
              </span>
              <ChevronRightIcon className="text-stone" />
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex h-12 cursor-pointer items-center justify-center gap-2.5 rounded-pill border border-divider-dark text-sm font-semibold hover:border-stone disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SignOutIcon />
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  );
}
