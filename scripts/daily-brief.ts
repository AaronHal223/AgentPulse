/**
 * Daily brief job: searches for every active client that's due, re-checks their saved homes,
 * then emails each agent.
 * For hosts with their own scheduler; needs the same env vars as the app:
 *   npm run brief
 * Unlike the HTTP cron endpoints, it has no time limit, so it finishes every client in one run.
 */
import "./load-env";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db";
import { dueForRecheck, dueForSearch, recheckStep, searchStep, type Due, type StepResult } from "../src/lib/daily";
import { sendBriefForAgent } from "../src/lib/brief";

async function work(label: string, queue: Due[], step: (due: Due) => Promise<StepResult>) {
  console.log(`${label} for ${queue.length} client(s)…`);
  for (const due of queue) {
    const started = Date.now();
    const result = await step(due);
    const seconds = Math.round((Date.now() - started) / 1000);
    if (result.error) console.error(`  ✗ ${result.name}: ${result.error}`);
    else console.log(`  ✓ ${result.name}: ${result.summary} in ${seconds}s`);
  }
}

async function main() {
  const db = await getDb();
  await work("Searching", await dueForSearch(), searchStep);
  await work("Re-checking saved homes", await dueForRecheck(), recheckStep);

  const appUrl = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
  const agents = await db.select().from(schema.agents).where(eq(schema.agents.briefEnabled, true));
  console.log(`Sending briefs to ${agents.length} agent(s)…`);
  for (const agent of agents) {
    try {
      const sent = await sendBriefForAgent(agent, appUrl);
      console.log(`  ✓ ${agent.email}: ${sent} item(s)`);
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
