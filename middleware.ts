import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Root Next.js middleware: delegates Supabase session-cookie refresh to the
// updateSession helper so the teacher session persists across requests.
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on all paths except Next.js internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
