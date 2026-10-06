import { PagePlaceholder } from "@/components/shell";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "My profile" };

/** Every signed-in user has a profile, whatever their roles. */
export default async function ProfilePage() {
  await getCurrentUser();
  return (
    <PagePlaceholder
      title="My profile"
      description="Your name, roles and the signature or initials used when you sign."
      feature="F05"
    />
  );
}
