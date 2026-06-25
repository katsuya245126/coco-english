import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";

// Clears the Supabase session, then redirects to login. POST so logout is not
// triggerable via a simple link prefetch / GET navigation.
export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${origin}/auth/login`, { status: 303 });
}
