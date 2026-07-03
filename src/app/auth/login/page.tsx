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
          <Link href="/" style={{ color: "#4B5563" }}>
            Back to role choice
          </Link>
          <span>
            Need an account?{" "}
            <Link href="/auth/signup" style={{ color: "#4B5563" }}>
              Create teacher account
            </Link>
          </span>
        </div>
      }
    >
      <LoginForm />
    </AuthFormShell>
  );
}
