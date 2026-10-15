import { NextResponse } from "next/server";
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { handler } from "@/lib/api";
import { assertCron } from "@/lib/cron";
import { searchHomesForBuyer } from "@/lib/ai/search";

export const maxDuration = 300;

/**
 * Searches for every active buyer that hasn't been searched in ~20 hours.
 * Stops starting new searches when the time budget runs low and reports how many remain,
 * so the scheduler can call it again until `remaining` is 0.
 */
export const GET = handler(async (req: Request) => {
  assertCron(req);
  const started = Date.now();
  const budgetMs = Number(process.env.CRON_BUDGET_SECONDS || 200) * 1000;
  const staleBefore = new Date(Date.now() - 20 * 3600 * 1000);
  const db = await getDb();

  const due = await db
    .select({ buyer: schema.buyers, agent: schema.agents })
    .from(schema.buyers)
    .innerJoin(schema.agents, eq(schema.buyers.agentId, schema.agents.id))
    .where(
      and(
        eq(schema.buyers.active, true),
        or(isNull(schema.buyers.lastSearchedAt), lt(schema.buyers.lastSearchedAt, staleBefore)),
      ),
    )
    .orderBy(asc(schema.buyers.lastSearchedAt));

  let processed = 0;
  const errors: string[] = [];
  for (const { buyer, agent } of due) {
    if (Date.now() - started > budgetMs) break;
    try {
      await searchHomesForBuyer(agent, buyer);
    } catch (err) {
      errors.push(`${buyer.id}: ${err instanceof Error ? err.message : String(err)}`);
      // Mark as searched so one broken profile can't block the queue.
      await db.update(schema.buyers).set({ lastSearchedAt: new Date() }).where(eq(schema.buyers.id, buyer.id));
    }
    processed++;
  }
  return NextResponse.json({ processed, remaining: due.length - processed, errors });
});
