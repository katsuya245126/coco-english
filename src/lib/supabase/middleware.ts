import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/db/types";

// Refreshes the Supabase Auth session cookies on each request so the teacher
// stays logged in across navigations and refreshes. Adapted from the Supabase
// Next.js SSR docs. Must run in middleware so Set-Cookie headers reach the
// browser.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const env = getSupabaseEnv();

  // If auth env is absent (e.g. CI without secrets), pass the request through
  // untouched rather than throwing in the middleware.
  if (!env.url || !env.anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Touch the auth state so cookies refresh. Do not run code between
  // createServerClient and getClaims per Supabase guidance.
  await supabase.auth.getClaims();

  return supabaseResponse;
}
