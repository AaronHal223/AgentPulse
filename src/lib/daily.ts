import "server-only";
import { and, asc, eq, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Agent, Buyer } from "./db/schema";
import { recheckSavedHomes, skipRecheck } from "./ai/recheck";
import { searchHomesForBuyer } from "./ai/search";

/**
 * The morning run, in small steps: a fresh search for each active client, then a second look
 * at the homes agents saved. The daily schedule (GitHub Actions → /api/cron/search, or
 * `npm run brief`) works through both queues. A step never throws, and a failed step still
 * counts as done for today, so one bad profile can't hold up everyone else.
 */

const STALE_HOURS = 20;
const staleBefore = () => new Date(Date.now() - STALE_HOURS * 3600 * 1000);

export type Due = { buyer: Buyer; agent: Agent };
export type StepResult = { buyerId: string; name: string; summary: string; error?: string };

const failure = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Active clients not searched for since yesterday, longest-waiting first. */
export async function dueForSearch(): Promise<Due[]> {
  const db = await getDb();
  return db
    .select({ buyer: schema.buyers, agent: schema.agents })
    .from(schema.buyers)
    .innerJoin(schema.agents, eq(schema.buyers.agentId, schema.agents.id))
    .where(and(eq(schema.buyers.active, true), or(isNull(schema.buyers.lastSearchedAt), lt(schema.buyers.lastSearchedAt, staleBefore()))))
    .orderBy(asc(schema.buyers.lastSearchedAt));
}

/** Active clients with saved homes nobody has looked at since yesterday. */
export async function dueForRecheck(): Promise<Due[]> {
  const db = await getDb();
  const stale = await db
    .selectDistinct({ buyerId: schema.matches.buyerId })
    .from(schema.matches)
    .where(
      and(
        eq(schema.matches.status, "saved"),
        ne(schema.matches.listingStatus, "sold"),
        or(isNull(schema.matches.lastCheckedAt), lt(schema.matches.lastCheckedAt, staleBefore())),
      ),
    );
  if (!stale.length) return [];
  return db
    .select({ buyer: schema.buyers, agent: schema.agents })
    .from(schema.buyers)
    .innerJoin(schema.agents, eq(schema.buyers.agentId, schema.agents.id))
    .where(and(eq(schema.buyers.active, true), inArray(schema.buyers.id, stale.map((s) => s.buyerId))));
}

export async function searchStep({ agent, buyer }: Due): Promise<StepResult> {
  const step = { buyerId: buyer.id, name: buyer.name };
  try {
    const { matches, alerts } = await searchHomesForBuyer(agent, buyer, { push: true });
    return { ...step, summary: `${matches.length} new home(s), ${alerts.length} alert(s)` };
  } catch (err) {
    const db = await getDb();
    await db.update(schema.buyers).set({ lastSearchedAt: new Date() }).where(eq(schema.buyers.id, buyer.id));
    return { ...step, summary: "search failed", error: failure(err) };
  }
}

export async function recheckStep({ agent, buyer }: Due): Promise<StepResult> {
  const step = { buyerId: buyer.id, name: buyer.name };
  try {
    const { homes, alerts } = await recheckSavedHomes(agent, buyer);
    return { ...step, summary: `${homes.length} saved home(s) re-checked, ${alerts.length} alert(s)` };
  } catch (err) {
    await skipRecheck(buyer.id);
    return { ...step, summary: "re-check failed", error: failure(err) };
  }
}
