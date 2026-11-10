import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Buyer, Match } from "./db/schema";
import { HttpError } from "./errors";
import {
  baseScoreOf,
  clampScore,
  feedbackAdjustment,
  type FeedbackEntry,
  type RejectReason,
  type Rescored,
  type Verdict,
} from "./scoring";

/** Loads a home together with its client, making sure both belong to this agent. */
export async function getOwnedMatch(agentId: string, matchId: string): Promise<{ match: Match; buyer: Buyer }> {
  const db = await getDb();
  const [row] = await db
    .select({ match: schema.matches, buyer: schema.buyers })
    .from(schema.matches)
    .innerJoin(schema.buyers, eq(schema.matches.buyerId, schema.buyers.id))
    .where(and(eq(schema.matches.id, matchId), eq(schema.buyers.agentId, agentId)))
    .limit(1);
  if (!row) throw new HttpError(404, "Home not found.");
  return row;
}

/** Everything said about a client's homes so far, newest first. */
export async function loadFeedback(buyerId: string): Promise<FeedbackEntry[]> {
  const db = await getDb();
  const rows = await db
    .select({ feedback: schema.matchFeedback, home: schema.matches })
    .from(schema.matchFeedback)
    .innerJoin(schema.matches, eq(schema.matchFeedback.matchId, schema.matches.id))
    .where(eq(schema.matchFeedback.buyerId, buyerId))
    .orderBy(desc(schema.matchFeedback.createdAt));
  return rows.map(({ feedback, home }) => ({
    source: feedback.source === "client" ? "client" : "agent",
    verdict: feedback.verdict as Verdict,
    reasons: feedback.reasons,
    note: feedback.note,
    home,
  }));
}

/**
 * Re-applies feedback to every home for a client and saves the scores that moved.
 * Runs after each new piece of feedback, so the list re-sorts itself as the agent works.
 */
export async function rescoreBuyer(buyerId: string): Promise<Rescored[]> {
  const db = await getDb();
  const [entries, homes] = await Promise.all([
    loadFeedback(buyerId),
    db.select().from(schema.matches).where(eq(schema.matches.buyerId, buyerId)),
  ]);
  const changed: Rescored[] = [];
  for (const home of homes) {
    const base = baseScoreOf(home);
    const score = clampScore(base + feedbackAdjustment(home, entries).delta);
    if (score === home.score && home.baseScore != null) continue;
    await db.update(schema.matches).set({ score, baseScore: base }).where(eq(schema.matches.id, home.id));
    if (score !== home.score) changed.push({ id: home.id, score });
  }
  return changed;
}

type FeedbackInput = { verdict: Verdict; reasons?: RejectReason[]; note?: string | null };

async function saveFeedback(match: Match, source: "agent" | "client", input: FeedbackInput) {
  const db = await getDb();
  const values = {
    matchId: match.id,
    buyerId: match.buyerId,
    source,
    verdict: input.verdict,
    reasons: input.reasons ?? [],
    note: input.note?.trim() || null,
  };
  await db
    .insert(schema.matchFeedback)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.matchFeedback.matchId, schema.matchFeedback.source],
      set: { ...values, createdAt: new Date() },
    });
}

async function clearFeedback(matchId: string, source: "agent" | "client") {
  const db = await getDb();
  await db
    .delete(schema.matchFeedback)
    .where(and(eq(schema.matchFeedback.matchId, matchId), eq(schema.matchFeedback.source, source)));
}

const STATUS_FOR = { saved: "saved", rejected: "dismissed" } as const;

/** The agent's Save / Reject / Undo on a home. Returns the scores that moved as a result. */
export async function setAgentVerdict(
  match: Match,
  verdict: "saved" | "rejected" | null,
  reasons: RejectReason[] = [],
): Promise<Rescored[]> {
  const db = await getDb();
  if (verdict) await saveFeedback(match, "agent", { verdict, reasons: verdict === "rejected" ? reasons : [] });
  else await clearFeedback(match.id, "agent");
  await db
    .update(schema.matches)
    .set({ status: verdict ? STATUS_FOR[verdict] : "new" })
    .where(eq(schema.matches.id, match.id));
  return rescoreBuyer(match.buyerId);
}

/**
 * Marks a home as sent to the client. Sending is a vote of confidence, so a home the agent
 * hasn't judged yet is saved too.
 */
export async function markSent(match: Match): Promise<{ sentAt: Date; rescored: Rescored[] }> {
  const db = await getDb();
  const sentAt = new Date();
  await db.update(schema.matches).set({ sentAt }).where(eq(schema.matches.id, match.id));
  const rescored = match.status === "saved" ? [] : await setAgentVerdict(match, "saved");
  return { sentAt, rescored };
}

export async function unmarkSent(match: Match) {
  const db = await getDb();
  await db.update(schema.matches).set({ sentAt: null }).where(eq(schema.matches.id, match.id));
}
