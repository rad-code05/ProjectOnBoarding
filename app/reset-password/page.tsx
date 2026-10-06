import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage() {
  const { userId } = await auth();
  if (userId) redirect("/");

  return (
    <AuthLayout>
      <ResetPasswordForm />
    </AuthLayout>
  );
}
