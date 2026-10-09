import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { SignaturePanel } from "@/components/profile/SignaturePanel";
import { Avatar, ChevronRightIcon, buttonStyles } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/navigation";
import { loadSignatures } from "@/lib/profile/signatures";
import { formatDay } from "@/lib/requests/format";

export const metadata = { title: "My profile" };

/** Every signed-in user has a profile, whatever their roles. */
export default async function ProfilePage() {
  const { roles } = await getCurrentUser();
  const [user, signatures] = await Promise.all([
    currentUser(),
    loadSignatures(),
  ]);
  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "—";
  const email = user?.primaryEmailAddress?.emailAddress ?? "—";

  const facts = [
    {
      label: "Roles",
      value: roles.map((role) => ROLE_LABELS[role]).join(" · ") || "None",
    },
    {
      label: "Sign-in",
      value: `Email + password · MFA ${user?.twoFactorEnabled ? "on" : "off"}`,
    },
    { label: "Timezone", value: "Europe/Zurich" },
    {
      label: "Member since",
      value: user?.createdAt
        ? formatDay(new Date(user.createdAt).toISOString())
        : "—",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-graphite uppercase">
          Account
        </span>
        <h1 className="font-serif text-[34px] leading-tight">My profile</h1>
      </div>

      <section
        aria-labelledby="acct-title"
        className="flex flex-col gap-3.5 rounded-card border border-line bg-paper p-4"
      >
        <div className="flex items-center gap-3">
          <Avatar name={name} size="lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="acct-title" className="font-serif text-[22px]">
              {name}
            </h2>
            <span className="truncate text-[13px] text-graphite">{email}</span>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {facts.map((fact) => (
            <div key={fact.label} className="contents">
              <dt className="text-graphite">{fact.label}</dt>
              <dd className={fact.label === "Roles" ? "font-semibold" : ""}>
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
        <Link
          href="/profile/security"
          className={`${buttonStyles("secondary", "md")} md:self-start`}
        >
          Manage password &amp; MFA
          <ChevronRightIcon />
        </Link>
        <p className="text-xs text-graphite">
          Name, email and roles are managed by the admin.
        </p>
      </section>

      <SignaturePanel state={signatures} />
    </div>
  );
}
