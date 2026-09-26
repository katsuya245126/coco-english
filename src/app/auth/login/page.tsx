import Link from "next/link";
import { AuthFormShell } from "@/components/auth/AuthFormShell";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <AuthFormShell
      title="Log in"
      footer={
        <div style={{ display: "grid", gap: 8 }}>
          <Link href="/">Back to role choice</Link>
          <span>
            Need an account?{" "}
            <Link href="/auth/signup">Create teacher account</Link>
          </span>
        </div>
      }
    >
      <LoginForm />
    </AuthFormShell>
  );
}
