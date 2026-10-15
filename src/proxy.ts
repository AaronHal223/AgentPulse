import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const APP_PREFIXES = ["/dashboard", "/buyers", "/settings"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const agentId = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/")) && !agentId) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if ((pathname === "/login" || pathname === "/signup") && agentId) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/buyers/:path*", "/settings/:path*", "/login", "/signup"],
};
