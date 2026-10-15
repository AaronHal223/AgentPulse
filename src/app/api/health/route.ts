import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Used by the host's health check: confirms the app is up and the database answers. */
export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return NextResponse.json({
      ok: true,
      ai: Boolean(process.env.ANTHROPIC_API_KEY),
      driveTimes: Boolean(process.env.ORS_API_KEY),
      email: Boolean(process.env.RESEND_API_KEY),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "db error" }, { status: 503 });
  }
}
