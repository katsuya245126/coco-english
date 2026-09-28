import { headers } from "next/headers";

// Best-effort client network signal for rate limiting (PIN unlock lockout,
// demo starts). Vercel's own header first; never used as identity.
export async function studentNetworkSignal(): Promise<string> {
  const headerStore = await headers();
  return (
    headerStore.get("x-vercel-forwarded-for")?.trim() ||
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip") ||
    "unknown"
  );
}
