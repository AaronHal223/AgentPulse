import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { getDb, schema } from "./db";
import { ALERT_MIN_SCORE } from "./listing-changes";

export const REPORT_DAYS = 7;

export type WeekCounts = {
  homesFound: number;
  strongMatches: number;
  homesSent: number;
  likes: number;
  passes: number;
  clientNotes: number;
  alerts: number;
  priceDrops: number;
  voiceNotes: number;
};

/**
 * Minutes of legwork each thing would have taken by hand. Deliberately modest, and shown on
 * the report so the agent can judge the estimate for themselves.
 */
export const MINUTES_EACH = {
  homeFound: 6, // searching portals, reading the listing, checking it against the profile
  alert: 5, // re-opening a saved listing to see if anything changed
  homeSent: 2, // writing a note to go with the link
  voiceNote: 3, // typing up notes after a showing
} as const;

export function estimateMinutesSaved(c: Pick<WeekCounts, "homesFound" | "alerts" | "homesSent" | "voiceNotes">): number {
  return (
    c.homesFound * MINUTES_EACH.homeFound +
    c.alerts * MINUTES_EACH.alert +
    c.homesSent * MINUTES_EACH.homeSent +
    c.voiceNotes * MINUTES_EACH.voiceNote
  );
}

/** 135 → "2 h 15 min" */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} h` : "", m || !h ? `${m} min` : ""].filter(Boolean).join(" ");
}

export type ClientWeek = { buyerId: string; name: string; found: number; sent: number; likes: number; passes: number };
export type WeeklyReport = { since: Date; counts: WeekCounts; minutesSaved: number; clients: ClientWeek[] };

/** What AgentPulse did for this agent over the last seven days. */
export async function weeklyReport(agentId: string, now = new Date()): Promise<WeeklyReport> {
  const db = await getDb();
  const since = new Date(now.getTime() - REPORT_DAYS * 24 * 3600 * 1000);
  const ofAgent = eq(schema.buyers.agentId, agentId);

  const [buyers, found, sent, reactions, alerts, voiceNotes] = await Promise.all([
    db.select({ id: schema.buyers.id, name: schema.buyers.name }).from(schema.buyers).where(ofAgent),
    db
      .select({ buyerId: schema.matches.buyerId, score: schema.matches.score, inArea: schema.matches.inArea })
      .from(schema.matches)
      .innerJoin(schema.buyers, eq(schema.matches.buyerId, schema.buyers.id))
      .where(and(ofAgent, gte(schema.matches.createdAt, since))),
    db
      .select({ buyerId: schema.matches.buyerId })
      .from(schema.matches)
      .innerJoin(schema.buyers, eq(schema.matches.buyerId, schema.buyers.id))
      .where(and(ofAgent, gte(schema.matches.sentAt, since))),
    db
      .select({ buyerId: schema.matchFeedback.buyerId, verdict: schema.matchFeedback.verdict, note: schema.matchFeedback.note })
      .from(schema.matchFeedback)
      .innerJoin(schema.buyers, eq(schema.matchFeedback.buyerId, schema.buyers.id))
      .where(and(ofAgent, eq(schema.matchFeedback.source, "client"), gte(schema.matchFeedback.createdAt, since))),
    db
      .select({ kind: schema.alerts.kind })
      .from(schema.alerts)
      .where(and(eq(schema.alerts.agentId, agentId), gte(schema.alerts.createdAt, since))),
    db
      .select({ id: schema.voiceNotes.id })
      .from(schema.voiceNotes)
      .innerJoin(schema.buyers, eq(schema.voiceNotes.buyerId, schema.buyers.id))
      .where(and(ofAgent, gte(schema.voiceNotes.createdAt, since))),
  ]);

  const counts: WeekCounts = {
    homesFound: found.length,
    strongMatches: found.filter((m) => m.score >= ALERT_MIN_SCORE && m.inArea).length,
    homesSent: sent.length,
    likes: reactions.filter((r) => r.verdict === "liked").length,
    passes: reactions.filter((r) => r.verdict === "disliked").length,
    clientNotes: reactions.filter((r) => r.note).length,
    alerts: alerts.length,
    priceDrops: alerts.filter((a) => a.kind === "price_drop").length,
    voiceNotes: voiceNotes.length,
  };

  const tally = (rows: { buyerId: string }[], id: string) => rows.filter((r) => r.buyerId === id).length;
  const clients = buyers
    .map((b) => ({
      buyerId: b.id,
      name: b.name,
      found: tally(found, b.id),
      sent: tally(sent, b.id),
      likes: tally(reactions.filter((r) => r.verdict === "liked"), b.id),
      passes: tally(reactions.filter((r) => r.verdict === "disliked"), b.id),
    }))
    .filter((c) => c.found + c.sent + c.likes + c.passes > 0)
    .sort((a, b) => b.found + b.sent + b.likes + b.passes - (a.found + a.sent + a.likes + a.passes));

  return { since, counts, minutesSaved: estimateMinutesSaved(counts), clients };
}
