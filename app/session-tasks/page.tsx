import { AuthLayout } from "@/components/auth/AuthLayout";
import { SessionTasks } from "@/components/auth/SessionTasks";

export const metadata = { title: "Finish setting up" };

export default function SessionTasksPage() {
  return (
    <AuthLayout>
      <SessionTasks />
    </AuthLayout>
  );
}
