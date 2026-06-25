import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/db/types";

// Browser (Client Component) Supabase client. Uses the public URL + anon key
// only; the service-role key must never reach the browser bundle.
export function createSupabaseBrowserClient() {
  const env = getSupabaseEnv();

  if (!env.url || !env.anonKey) {
    throw new Error("Supabase browser environment is not configured");
  }

  return createBrowserClient<Database>(env.url, env.anonKey);
}
