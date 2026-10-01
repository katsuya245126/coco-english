import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { demoClassId } from "@/server/demo/demo-config";

// Teacher surfaces are closed on the public demo deployment: an open teacher
// signup there would let strangers create classes on the demo's provider keys.
// Everywhere else, refresh the teacher's Supabase session cookies; Server
// Components cannot write them, so this is the only place a rotated token is
// saved. Lives in src/ because Next.js only loads middleware next to the app dir.
export async function middleware(request: NextRequest) {
  if (!demoClassId()) return updateSession(request);
  return NextResponse.redirect(new URL("/", request.nextUrl));
}

export const config = {
  matcher: ["/auth/:path*", "/teacher/:path*", "/api/teacher/:path*"],
};
