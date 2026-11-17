import "server-only";
import { and, eq, gte, inArray, isNull, lt, max, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Agent, Buyer } from "./db/schema";
import { recheckSavedHomes, skipRecheck } from "./ai/recheck";
import { searchHomesForBuyer } from "./ai/search";
import { aiConfigured } from "./ai/provider";

/**
 * The morning run, in small steps: a fresh search for each active client, then a second look
 * at the homes agents saved. The daily schedule (GitHub Actions → /api/cron/search, or
 * `npm run brief`) works through both queues. A step never throws, and a failed step still
 * counts as done for today, so one bad profile can't hold up everyone else.
 */

const STALE_HOURS = 20;
const staleBefore = () => new Date(Date.now() - STALE_HOURS * 3600 * 1000);

// Paused clients and the practice client are never searched for.
const realAndActive = and(eq(schema.buyers.active, true), eq(schema.buyers.isSample, false));

export type Due = { buyer: Buyer; agent: Agent };
export type StepResult = { buyerId: string; name: string; summary: string; error?: string };

const failure = (err: unknown) => (err instanceof Error ? err.message : String(err));

const DAY_MS = 24 * 3600 * 1000;
export const QUIET_AFTER_DAYS = 14;
export const QUIET_EVERY_DAYS = 3;

/** How many scheduled searches may run in a day, so the AI's free daily limit lasts. */
export const dailySearchCap = () => Number(process.env.AI_DAILY_SEARCHES || 20);

/**
 * Whether a client is due for a search. Clients nobody has touched in two weeks (no chat, no
 * reactions, no edits) are searched every three days instead of daily.
 */
export function isDueForSearch(lastSearchedAt: Date | null, lastActivityAt: Date, now = new Date()): boolean {
  if (!lastSearchedAt) return true;
  const quiet = now.getTime() - lastActivityAt.getTime() > QUIET_AFTER_DAYS * DAY_MS;
  const waitMs = quiet ? QUIET_EVERY_DAYS * DAY_MS - (24 - STALE_HOURS) * 3600 * 1000 : STALE_HOURS * 3600 * 1000;
  return now.getTime() - lastSearchedAt.getTime() >= waitMs;
}

/** The latest thing the agent or client did for each client: a chat message, a reaction, an edit. */
async function lastActivity(buyerIds: string[]): Promise<Map<string, Date>> {
  if (!buyerIds.length) return new Map();
  const db = await getDb();
  const [messages, reactions] = await Promise.all([
    db
      .select({ buyerId: schema.messages.buyerId, at: max(schema.messages.createdAt) })
      .from(schema.messages)
      .where(and(inArray(schema.messages.buyerId, buyerIds), eq(schema.messages.role, "user")))
      .groupBy(schema.messages.buyerId),
    db
      .select({ buyerId: schema.matchFeedback.buyerId, at: max(schema.matchFeedback.createdAt) })
      .from(schema.matchFeedback)
      .where(inArray(schema.matchFeedback.buyerId, buyerIds))
      .groupBy(schema.matchFeedback.buyerId),
  ]);
  const latest = new Map<string, Date>();
  for (const { buyerId, at } of [...messages, ...reactions]) {
    if (at && (!latest.has(buyerId) || at > latest.get(buyerId)!)) latest.set(buyerId, at);
  }
  return latest;
}

/** Searches already run (by schedule or by hand) in the last day, which count toward the cap. */
async function searchesToday(): Promise<number> {
  const db = await getDb();
  const rows = await db.select({ id: schema.buyers.id }).from(schema.buyers).where(gte(schema.buyers.lastSearchedAt, new Date(Date.now() - DAY_MS)));
  return rows.length;
}

/**
 * Active clients due for a search, longest-waiting first, cut off at what's left of today's
 * cap. Anyone left over is first in line tomorrow.
 */
export async function dueForSearch(now = new Date()): Promise<Due[]> {
  // Without an AI key every search would fail; wait quietly until it's added.
  if (!aiConfigured()) return [];
  const db = await getDb();
  const candidates = await db
    .select({ buyer: schema.buyers, agent: schema.agents })
    .from(schema.buyers)
    .innerJoin(schema.agents, eq(schema.buyers.agentId, schema.agents.id))
    .where(and(realAndActive, or(isNull(schema.buyers.lastSearchedAt), lt(schema.buyers.lastSearchedAt, staleBefore()))))
    // Never-searched clients first: Postgres would otherwise put them last.
    .orderBy(sql`${schema.buyers.lastSearchedAt} asc nulls first`);
  const activity = await lastActivity(candidates.map((c) => c.buyer.id));
  const due = candidates.filter(({ buyer }) => {
    const touched = [activity.get(buyer.id), buyer.updatedAt, buyer.createdAt].filter((d): d is Date => Boolean(d));
    const lastTouched = new Date(Math.max(...touched.map((d) => d.getTime())));
    return isDueForSearch(buyer.lastSearchedAt, lastTouched, now);
  });
  const left = Math.max(0, dailySearchCap() - (await searchesToday()));
  return due.slice(0, left);
}

/** Active clients with saved homes nobody has looked at since yesterday. */
export async function dueForRecheck(): Promise<Due[]> {
  if (!aiConfigured()) return [];
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
    .where(and(realAndActive, inArray(schema.buyers.id, stale.map((s) => s.buyerId))));
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
