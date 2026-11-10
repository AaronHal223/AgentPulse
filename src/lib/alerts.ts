import "server-only";
import { and, count, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Alert, Buyer, Match } from "./db/schema";
import { newMatchAlert, type AlertDraft } from "./listing-changes";
import { pushToAgent } from "./push";

export type AlertWithClient = Alert & { buyerName: string };

type Target = { agentId: string; buyerId: string; matchId: string };

/** Saves alerts for one home and, unless told not to, notifies the agent's devices. */
export async function raiseAlerts(target: Target, drafts: AlertDraft[], opts: { push?: boolean } = {}): Promise<Alert[]> {
  if (!drafts.length) return [];
  const db = await getDb();
  const saved = await db
    .insert(schema.alerts)
    .values(drafts.map((d) => ({ ...target, ...d })))
    .returning();
  if (opts.push !== false) {
    for (const alert of saved) {
      await pushToAgent(target.agentId, { title: alert.title, body: alert.body, url: `/buyers/${target.buyerId}`, tag: alert.id });
    }
  }
  return saved;
}

/** Raises an alert for each freshly found home that scores 8 or more in the client's area. */
export async function alertNewMatches(agentId: string, buyer: Buyer, matches: Match[], opts: { push?: boolean } = {}) {
  const raised: Alert[] = [];
  for (const match of matches) {
    const draft = newMatchAlert(buyer, match);
    if (draft) raised.push(...(await raiseAlerts({ agentId, buyerId: buyer.id, matchId: match.id }, [draft], opts)));
  }
  return raised;
}

const withClient = { alert: schema.alerts, buyerName: schema.buyers.name };
const flatten = (rows: { alert: Alert; buyerName: string }[]): AlertWithClient[] => rows.map((r) => ({ ...r.alert, buyerName: r.buyerName }));

/** This agent's alerts, newest first. */
export async function listAlerts(agentId: string, opts: { limit?: number; unreadOnly?: boolean } = {}): Promise<AlertWithClient[]> {
  const db = await getDb();
  const rows = await db
    .select(withClient)
    .from(schema.alerts)
    .innerJoin(schema.buyers, eq(schema.alerts.buyerId, schema.buyers.id))
    .where(and(eq(schema.alerts.agentId, agentId), opts.unreadOnly ? isNull(schema.alerts.readAt) : undefined))
    .orderBy(desc(schema.alerts.createdAt))
    .limit(opts.limit ?? 50);
  return flatten(rows);
}

export async function unreadAlertCount(agentId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(schema.alerts)
    .where(and(eq(schema.alerts.agentId, agentId), isNull(schema.alerts.readAt)));
  return row?.n ?? 0;
}

/** Marks alerts as read. Only ever touches this agent's own alerts, whatever ids are sent. */
export async function markAlertsRead(agentId: string, ids?: string[]) {
  if (ids && !ids.length) return;
  const db = await getDb();
  await db
    .update(schema.alerts)
    .set({ readAt: new Date() })
    .where(and(eq(schema.alerts.agentId, agentId), isNull(schema.alerts.readAt), ids ? inArray(schema.alerts.id, ids) : undefined));
}

/** Changes on saved homes from the last week that haven't gone out in a brief email yet. */
export async function alertsForBrief(agentId: string): Promise<AlertWithClient[]> {
  const db = await getDb();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const rows = await db
    .select(withClient)
    .from(schema.alerts)
    .innerJoin(schema.buyers, eq(schema.alerts.buyerId, schema.buyers.id))
    .where(and(eq(schema.alerts.agentId, agentId), isNull(schema.alerts.briefedAt), gte(schema.alerts.createdAt, since)))
    .orderBy(desc(schema.alerts.createdAt))
    .limit(30);
  return flatten(rows);
}

export async function markAlertsBriefed(ids: string[]) {
  if (!ids.length) return;
  const db = await getDb();
  await db.update(schema.alerts).set({ briefedAt: new Date() }).where(inArray(schema.alerts.id, ids));
}
