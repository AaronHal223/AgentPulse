import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { authSecretOk } from "@/lib/session";
import { aiConfigured, aiProvider } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

/** Full check: the app is up, the database answers and required settings are present. */
export async function GET() {
  const config = {
    aiProvider: aiProvider(),
    ai: aiConfigured(),
    driveTimes: Boolean(process.env.ORS_API_KEY),
    email: Boolean(process.env.RESEND_API_KEY),
    authSecret: authSecretOk(),
    inviteOnly: Boolean(process.env.SIGNUP_CODE),
  };
  let database = false;
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    database = true;
  } catch (err) {
    // Details go to the server log only — never to the public.
    console.error("health: database check failed", err);
  }
  const ok = database && config.authSecret;
  return NextResponse.json({ ok, database, ...config }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
