import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Buyer } from "./db/schema";
import { ALERT_MIN_SCORE } from "./listing-changes";
import { callReason, pulseOf, PULSE_WINDOW_DAYS, type CallReason, type Pulse, type PulseSignals } from "./pulse";

export type ClientPulse = { buyer: Buyer; pulse: Pulse; call: CallReason | null };

const DAY_MS = 24 * 3600 * 1000;
const daysAgo = (date: Date | null | undefined, now: Date) => (date ? Math.floor((now.getTime() - date.getTime()) / DAY_MS) : null);
const latest = (dates: (Date | null | undefined)[]) => dates.reduce<Date | null>((max, d) => (d && (!max || d > max) ? d : max), null);

/** The pulse of each of this agent's active clients, from their last two weeks of activity. */
export async function clientPulses(agentId: string, now = new Date()): Promise<ClientPulse[]> {
  const db = await getDb();
  const buyers = await db.select().from(schema.buyers).where(and(eq(schema.buyers.agentId, agentId), eq(schema.buyers.active, true)));
  if (!buyers.length) return [];
  const ids = buyers.map((b) => b.id);
  const since = new Date(now.getTime() - PULSE_WINDOW_DAYS * DAY_MS);

  // Only the columns the arithmetic needs: this runs on every dashboard load.
  const m = schema.matches;
  const f = schema.matchFeedback;
  const [homes, reactions, links, agentMessages] = await Promise.all([
    db
      .select({ id: m.id, buyerId: m.buyerId, score: m.score, inArea: m.inArea, status: m.status, sentAt: m.sentAt, listingStatus: m.listingStatus })
      .from(m)
      .where(inArray(m.buyerId, ids)),
    db
      .select({ buyerId: f.buyerId, matchId: f.matchId, verdict: f.verdict, note: f.note, createdAt: f.createdAt })
      .from(f)
      .where(and(inArray(f.buyerId, ids), eq(f.source, "client"))),
    db
      .select({ buyerId: schema.shareLinks.buyerId, lastViewedAt: schema.shareLinks.lastViewedAt })
      .from(schema.shareLinks)
      .where(inArray(schema.shareLinks.buyerId, ids)),
    db
      .select({ buyerId: schema.messages.buyerId, createdAt: schema.messages.createdAt })
      .from(schema.messages)
      .where(and(inArray(schema.messages.buyerId, ids), eq(schema.messages.role, "user"), gte(schema.messages.createdAt, since))),
  ]);

  return buyers.map((buyer) => {
    const mine = <T extends { buyerId: string }>(rows: T[]) => rows.filter((r) => r.buyerId === buyer.id);
    const myHomes = mine(homes).filter((h) => h.status !== "dismissed");
    const myReactions = mine(reactions);
    const recent = myReactions.filter((r) => r.createdAt >= since);
    const reactedTo = new Set(myReactions.map((r) => r.matchId));
    const sent = myHomes.filter((h) => h.sentAt);
    const notes = mine(agentMessages);

    const signals: PulseSignals = {
      likes: recent.filter((r) => r.verdict === "liked").length,
      passes: recent.filter((r) => r.verdict === "disliked").length,
      notes: recent.filter((r) => r.note).length,
      daysSinceClientActivity: daysAgo(latest([...myReactions.map((r) => r.createdAt), ...mine(links).map((l) => l.lastViewedAt)]), now),
      awaitingReaction: sent.filter((h) => !reactedTo.has(h.id)).length,
      daysSinceLastSend: daysAgo(latest(sent.map((h) => h.sentAt)), now),
      strongUnsent: myHomes.filter((h) => h.score >= ALERT_MIN_SCORE && h.inArea && !h.sentAt && h.listingStatus === "active").length,
      agentNotes: notes.length,
      daysSinceAgentActivity: daysAgo(latest(notes.map((n) => n.createdAt)), now),
    };
    return { buyer, pulse: pulseOf(signals), call: callReason(signals) };
  });
}

/** Clients worth a call today, most pressing first. */
export function callList(pulses: ClientPulse[], max = 5): (ClientPulse & { call: CallReason })[] {
  return pulses
    .filter((p): p is ClientPulse & { call: CallReason } => p.call !== null)
    .sort((a, b) => b.call.priority - a.call.priority || b.pulse.score - a.pulse.score)
    .slice(0, max);
}
