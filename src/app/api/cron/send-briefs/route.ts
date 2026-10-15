import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { handler } from "@/lib/api";
import { assertCron } from "@/lib/cron";
import { appUrlFrom, sendBriefForAgent } from "@/lib/brief";

export const maxDuration = 120;

export const GET = handler(async (req: Request) => {
  assertCron(req);
  const db = await getDb();
  const agents = await db.select().from(schema.agents).where(eq(schema.agents.briefEnabled, true));
  const results: { agent: string; sent?: number; error?: string }[] = [];
  for (const agent of agents) {
    try {
      results.push({ agent: agent.id, sent: await sendBriefForAgent(agent, appUrlFrom(req)) });
    } catch (err) {
      results.push({ agent: agent.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ results });
});
