import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";

// Email-verification / OAuth callback: exchanges the auth code for a session
// via the cookie-aware SSR client, then routes the teacher onward. New users
// have no profile yet, so requireTeacherProfile on /teacher will forward them
// to /auth/profile for first-login bootstrap.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  return NextResponse.redirect(`${origin}/teacher`);
}
