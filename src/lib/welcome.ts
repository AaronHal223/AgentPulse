import "server-only";
import { and, count, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Agent } from "./db/schema";

export type WelcomeStep = { key: string; label: string; hint: string; href: string; done: boolean };
export type Welcome = { steps: WelcomeStep[]; hasSample: boolean };

/**
 * The getting-started checklist for a new agent: each step ticks itself off from what they've
 * actually done. Null once they've finished or closed it.
 */
export async function welcomeFor(agent: Agent): Promise<Welcome | null> {
  if (agent.welcomeDismissedAt) return null;
  const db = await getDb();
  const mine = eq(schema.buyers.agentId, agent.id);
  const real = and(mine, eq(schema.buyers.isSample, false));
  const homes = () => db.select({ n: count() }).from(schema.matches).innerJoin(schema.buyers, eq(schema.matches.buyerId, schema.buyers.id));

  const [[clients], [found], [sent], [devices], [samples]] = await Promise.all([
    db.select({ n: count() }).from(schema.buyers).where(real),
    homes().where(real),
    homes().where(and(mine, isNotNull(schema.matches.sentAt))),
    db.select({ n: count() }).from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.agentId, agent.id)),
    db.select({ n: count() }).from(schema.buyers).where(and(mine, eq(schema.buyers.isSample, true))),
  ]);

  const steps: WelcomeStep[] = [
    { key: "client", label: "Add your first client", hint: "Paste notes, an email or a spreadsheet. AgentPulse builds the profile.", href: "/buyers/new", done: clients.n > 0 },
    { key: "homes", label: "Find homes for them", hint: "Open the client and tap Find homes. Each home gets a 1–10 score.", href: "/buyers", done: found.n > 0 },
    { key: "send", label: "Send a home to a client", hint: "Tap Send to client on a home you like. They can thumbs-up or down.", href: "/buyers", done: sent.n > 0 },
    { key: "notify", label: "Turn on notifications", hint: "Hear about price drops and strong new matches on your phone.", href: "/alerts", done: devices.n > 0 },
    { key: "voice", label: "Tell it how you write", hint: "So follow-up drafts sound like you.", href: "/settings", done: Boolean(agent.tone) },
  ];
  if (steps.every((s) => s.done)) return null;
  return { steps, hasSample: samples.n > 0 };
}

export async function dismissWelcome(agentId: string) {
  const db = await getDb();
  await db.update(schema.agents).set({ welcomeDismissedAt: new Date() }).where(eq(schema.agents.id, agentId));
}
