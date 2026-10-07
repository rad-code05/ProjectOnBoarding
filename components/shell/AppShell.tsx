import type { ReactNode } from "react";
import { TopBar, type TopBarProps } from "./TopBar";

export type AppShellProps = TopBarProps & { children: ReactNode };

/**
 * Frame for every signed-in page: top bar + content on sand.
 * Left rail / right panel (design/components.md) arrive with the features
 * that need them.
 */
export function AppShell({ children, ...topBar }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-sand">
      <TopBar {...topBar} />
      <main className="flex-1 px-4 py-6 md:px-7 md:py-8">{children}</main>
    </div>
  );
}
