import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Clears a login cookie whose account no longer exists, then shows the login page. */
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/login?expired=1", req.url), { status: 307 });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
