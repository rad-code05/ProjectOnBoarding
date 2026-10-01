import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Laine onboarding rights",
  description: "Internal user access management for Laine.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* Clerk Core 3: the provider lives inside <body>. */}
        <ClerkProvider
          signInUrl="/sign-in"
          taskUrls={{ "setup-mfa": "/session-tasks" }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
