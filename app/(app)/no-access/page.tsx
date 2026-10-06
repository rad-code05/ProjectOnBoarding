import { StatusPage } from "@/components/shell";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "No access" };

/** Where requireRole() sends a signed-in user who lacks the role. */
export default async function NoAccessPage() {
  await getCurrentUser();
  return (
    <StatusPage
      code="403"
      label="not allowed"
      title="You don't have access to this page"
      message="Your role doesn't include this. If you think it should, contact Raju."
      action={{ href: "/", label: "Go to my start page" }}
    />
  );
}
