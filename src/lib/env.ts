export function getSupabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    // Server-only secret used by later plans to pepper student PIN hashes.
    // Never exposed to the browser (no NEXT_PUBLIC_ prefix).
    pinPepper: process.env.PIN_HASH_PEPPER,
    isConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    // Auth (SSR user client) requires the public URL + anon key rather than the
    // service-role key.
    isAuthConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}
