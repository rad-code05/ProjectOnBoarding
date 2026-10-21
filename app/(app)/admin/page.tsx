import Link from "next/link";
import { ChevronRightIcon, LockIcon } from "@/components/ui";
import { loadAdminOverview } from "@/lib/admin/overview";
import { requireRole } from "@/lib/auth";
import { PAGES } from "@/lib/navigation";

export const metadata = { title: "Admin" };

const LATER = [
  { title: "Users & roles", note: "Invite people, change roles" },
  { title: "Form fields & versions", note: "Add a field to the form" },
  {
    title: "Templates & defaults",
    note: "Role templates, SLA, PDF naming",
  },
];

/** Admin home (board: Phone · Admin (home)) — Raju only. */
export default async function AdminPage() {
  await requireRole(...PAGES.admin.roles);
  const o = await loadAdminOverview();
  const areas = [
    {
      href: "/admin/applications",
      title: "Applications",
      note: `${o.appsActive} active · ${o.appsRetired} retired · ${o.categories} categories`,
    },
    {
      href: "/admin/types",
      title: "Equipment & access types",
      note: `${o.equipmentTypes} equipment types · ${o.accessTypes} access types`,
    },
    {
      href: "/admin/offices",
      title: "Offices",
      note: `${o.offices} offices · ${o.officeCities} cities`,
    },
    {
      href: "/admin/settings",
      title: "Settings",
      note: `Company timezone: ${o.companyTimezone}`,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[34px] leading-tight">Admin</h1>
        <p className="text-sm leading-normal text-graphite">
          The lists and settings the request form uses. Every change is recorded
          in the audit log.
        </p>
      </div>

      <ul className="rounded-card border border-line bg-paper">
        {areas.map((area) => (
          <li
            key={area.href}
            className="border-b border-line-subtle last:border-b-0"
          >
            <Link
              href={area.href}
              className="flex min-h-16 items-center gap-3 px-3.5 py-3"
            >
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-base font-bold">{area.title}</span>
                <span className="text-xs text-graphite">{area.note}</span>
              </span>
              <ChevronRightIcon size={18} />
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="later-title" className="flex flex-col gap-2">
        <h2 id="later-title" className="font-serif text-xl">
          Coming later
        </h2>
        <ul className="rounded-card border border-line">
          {LATER.map((item) => (
            <li
              key={item.title}
              className="flex min-h-14 items-center gap-3 border-b border-line-subtle px-3.5 py-2.5 text-graphite last:border-b-0"
            >
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{item.title}</span>
                <span className="text-xs">{item.note}</span>
              </span>
              <LockIcon size={16} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
