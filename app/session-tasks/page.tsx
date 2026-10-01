import { AuthLayout } from "@/components/auth/AuthLayout";
import { SessionTasks } from "@/components/auth/SessionTasks";

export const metadata = {
  title: "Finish setting up — Laine onboarding rights",
};

export default function SessionTasksPage() {
  return (
    <AuthLayout>
      <SessionTasks />
    </AuthLayout>
  );
}
