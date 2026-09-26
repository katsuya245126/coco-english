import Link from "next/link";
import { AuthFormShell } from "@/components/auth/AuthFormShell";
import { SignupForm } from "@/components/auth/SignupForm";

// Avoid caching the authenticated/auth-entry surface per Supabase SSR guidance.
export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <AuthFormShell
      title="Create teacher account"
      footer={
        <span>
          Already have an account?{" "}
          <Link href="/auth/login">Log in</Link>
        </span>
      }
    >
      <SignupForm />
    </AuthFormShell>
  );
}
