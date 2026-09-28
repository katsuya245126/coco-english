import { NextResponse, type NextRequest } from "next/server";
import { demoClassId } from "@/server/demo/demo-config";

// Teacher surfaces are closed on the public demo deployment: an open teacher
// signup there would let strangers create classes on the demo's provider keys.
// Lives in src/ because Next.js only loads middleware next to the app dir.
export function middleware(request: NextRequest) {
  if (!demoClassId()) return NextResponse.next();
  return NextResponse.redirect(new URL("/", request.nextUrl));
}

export const config = {
  matcher: ["/auth/:path*", "/teacher/:path*", "/api/teacher/:path*"],
};
