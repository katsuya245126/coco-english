import { redirect } from "next/navigation";
import { AuthFormShell } from "@/components/auth/AuthFormShell";
import { ProfileForm } from "@/components/auth/ProfileForm";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

// First-login bootstrap: a verified teacher with no profile row sets their
// display name here, then lands on /teacher. Requires an authenticated session.
export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    redirect("/auth/login");
  }

  const claims = data.claims as { user_metadata?: { display_name?: string } };
  const defaultName = claims.user_metadata?.display_name;

  return (
    <AuthFormShell title="Set up your profile">
      <p
        style={{
          fontSize: 16,
          lineHeight: 1.5,
          color: "#4B5563",
          margin: "0 0 8px",
        }}
      >
        Choose the display name your students and classes are organized under.
      </p>
      <ProfileForm defaultName={defaultName} />
    </AuthFormShell>
  );
}
