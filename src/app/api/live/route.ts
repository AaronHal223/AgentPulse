import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness check: answers as long as the web server is running, without touching the database.
 * The host's health check and the keep-awake ping use this, so a brief database hiccup can't
 * make the host restart the app, and pings don't wake the database (saving its free hours).
 */
export function GET() {
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
