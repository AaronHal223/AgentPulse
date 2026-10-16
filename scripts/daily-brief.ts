/**
 * Daily brief job: searches for every active client that's due, then emails each agent.
 * Runs as a scheduled job on the host (Render Cron Job) with the same env vars as the app:
 *   npm run brief
 * Unlike the HTTP cron endpoints, it has no time limit, so it finishes every client in one run.
 */
import "./load-env";
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db";
import { searchHomesForBuyer } from "../src/lib/ai/search";
import { sendBriefForAgent } from "../src/lib/brief";

async function main() {
  const db = await getDb();
  const staleBefore = new Date(Date.now() - 20 * 3600 * 1000);
  const due = await db
    .select({ buyer: schema.buyers, agent: schema.agents })
    .from(schema.buyers)
    .innerJoin(schema.agents, eq(schema.buyers.agentId, schema.agents.id))
    .where(and(eq(schema.buyers.active, true), or(isNull(schema.buyers.lastSearchedAt), lt(schema.buyers.lastSearchedAt, staleBefore))))
    .orderBy(asc(schema.buyers.lastSearchedAt));

  console.log(`Searching for ${due.length} client(s)…`);
  for (const { buyer, agent } of due) {
    const started = Date.now();
    try {
      const { matches } = await searchHomesForBuyer(agent, buyer);
      console.log(`  ✓ ${buyer.name}: ${matches.length} new home(s) in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (err) {
      console.error(`  ✗ ${buyer.name}:`, err instanceof Error ? err.message : err);
      await db.update(schema.buyers).set({ lastSearchedAt: new Date() }).where(eq(schema.buyers.id, buyer.id));
    }
  }

  const appUrl = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
  const agents = await db.select().from(schema.agents).where(eq(schema.agents.briefEnabled, true));
  console.log(`Sending briefs to ${agents.length} agent(s)…`);
  for (const agent of agents) {
    try {
      const sent = await sendBriefForAgent(agent, appUrl);
      console.log(`  ✓ ${agent.email}: ${sent} home(s)`);
    } catch (err) {
      console.error(`  ✗ ${agent.email}:`, err instanceof Error ? err.message : err);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
