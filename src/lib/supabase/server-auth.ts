import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/db/types";

// Cookie-aware SSR Supabase client for Server Components, Server Actions, and
// route handlers. Uses the anon key + the request cookie store so RLS runs as
// the authenticated teacher. Distinct from the service-role client in
// src/lib/supabase/server.ts, which bypasses RLS and must stay server-only.
export async function createSupabaseServerClient() {
  const env = getSupabaseEnv();

  if (!env.url || !env.anonKey) {
    throw new Error("Supabase auth environment is not configured");
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // setAll can be called from a Server Component where mutating cookies
          // is not allowed. The middleware refreshes the session cookies, so
          // this is safe to ignore per Supabase SSR guidance.
        }
      },
    },
  });
}
