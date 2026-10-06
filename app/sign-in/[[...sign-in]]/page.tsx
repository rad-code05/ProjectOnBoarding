import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { SignInForm } from "@/components/auth/SignInForm";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  // Already signed in? Go to the start page instead.
  const { userId } = await auth();
  if (userId) redirect("/");

  return (
    <AuthLayout>
      <SignInForm />
    </AuthLayout>
  );
}
