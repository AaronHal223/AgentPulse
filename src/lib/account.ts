import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Agent } from "./db/schema";
import { sendEmail } from "./brief";
import { HttpError } from "./errors";

/** Account upkeep: forgotten passwords, changing a password or email, leaving, taking data along. */

export const MIN_PASSWORD = 10;
const RESET_MINUTES = 60;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const hashPassword = (password: string) => bcrypt.hash(password, 12);

async function requirePassword(agent: Agent, password: string) {
  if (!(await bcrypt.compare(password, agent.passwordHash))) throw new HttpError(403, "That password isn't right.");
}

function resetEmail(agent: Agent, link: string) {
  const text = `Hi ${agent.name.split(" ")[0]},\n\nUse this link to choose a new AgentPulse password. It works once, for the next hour:\n${link}\n\nIf you didn't ask for this, ignore this email. Your password stays the same.`;
  const html = `<p style="font:15px Arial,sans-serif;color:#16302b">Hi ${agent.name.split(" ")[0].replace(/[<>&"]/g, "")},</p>
<p style="font:15px Arial,sans-serif;color:#16302b">Use the button below to choose a new AgentPulse password. It works once, for the next hour.</p>
<p><a href="${link}" style="display:inline-block;background:#16302b;color:#fff;font:600 15px Arial,sans-serif;padding:10px 18px;border-radius:8px;text-decoration:none">Choose a new password</a></p>
<p style="font:13px Arial,sans-serif;color:#6b7772">If you didn't ask for this, ignore this email. Your password stays the same.</p>`;
  return { subject: "Reset your AgentPulse password", html, text };
}

/**
 * Emails a one-time reset link if the address has an account. Says nothing either way, so
 * the form can't be used to find out who has an account.
 */
export async function requestPasswordReset(email: string, appUrl: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) throw new HttpError(503, "Password emails aren't set up on this site yet. Ask the AgentPulse owner for help.");
  const db = await getDb();
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.email, email)).limit(1);
  if (!agent) return;

  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.passwordResets).values({
    agentId: agent.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000),
  });
  const { subject, html, text } = resetEmail(agent, `${appUrl}/reset?token=${token}`);
  await sendEmail(agent.email, subject, html, text);
}

/** Sets a new password from a reset link. The link works once; every device is logged out. */
export async function resetPassword(token: string, password: string): Promise<Agent> {
  const db = await getDb();
  // Claiming the link and checking it in one statement means two clicks can't both win.
  const [claimed] = await db
    .update(schema.passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.passwordResets.tokenHash, hashToken(token)), isNull(schema.passwordResets.usedAt), gt(schema.passwordResets.expiresAt, new Date())))
    .returning({ agentId: schema.passwordResets.agentId });
  if (!claimed) throw new HttpError(400, "This reset link has expired or was already used. Ask for a new one.");
  return setPassword(claimed.agentId, password);
}

async function setPassword(agentId: string, password: string): Promise<Agent> {
  const db = await getDb();
  const [agent] = await db
    .update(schema.agents)
    .set({ passwordHash: await hashPassword(password), sessionVersion: sql`${schema.agents.sessionVersion} + 1` })
    .where(eq(schema.agents.id, agentId))
    .returning();
  // Any other reset links still out there die with the old password.
  await db.update(schema.passwordResets).set({ usedAt: new Date() }).where(and(eq(schema.passwordResets.agentId, agentId), isNull(schema.passwordResets.usedAt)));
  return agent;
}

export async function changePassword(agent: Agent, current: string, next: string): Promise<Agent> {
  await requirePassword(agent, current);
  return setPassword(agent.id, next);
}

export async function changeEmail(agent: Agent, password: string, email: string): Promise<Agent> {
  await requirePassword(agent, password);
  const db = await getDb();
  const [taken] = await db.select({ id: schema.agents.id }).from(schema.agents).where(eq(schema.agents.email, email)).limit(1);
  if (taken && taken.id !== agent.id) throw new HttpError(409, "Another account already uses that email.");
  // The brief follows the login email unless the agent pointed it somewhere else.
  const briefEmail = agent.briefEmail === agent.email ? email : agent.briefEmail;
  const [updated] = await db.update(schema.agents).set({ email, briefEmail }).where(eq(schema.agents.id, agent.id)).returning();
  return updated;
}

/** Deletes the agent and everything of theirs: clients, homes, notes, links, alerts. */
export async function deleteAccount(agent: Agent, password: string): Promise<void> {
  await requirePassword(agent, password);
  const db = await getDb();
  await db.delete(schema.agents).where(eq(schema.agents.id, agent.id));
}

/** Everything AgentPulse holds for one agent, as plain data they can keep. Never includes secrets. */
export async function exportAccount(agent: Agent) {
  const db = await getDb();
  const clients = await db.select().from(schema.buyers).where(eq(schema.buyers.agentId, agent.id));
  const ids = clients.map((c) => c.id);
  const of = async <T>(load: () => Promise<T[]>) => (ids.length ? load() : []);
  const [messages, homes, feedback, voiceNotes, alerts] = await Promise.all([
    of(() => db.select().from(schema.messages).where(inArray(schema.messages.buyerId, ids))),
    of(() => db.select().from(schema.matches).where(inArray(schema.matches.buyerId, ids))),
    of(() => db.select().from(schema.matchFeedback).where(inArray(schema.matchFeedback.buyerId, ids))),
    of(() => db.select().from(schema.voiceNotes).where(inArray(schema.voiceNotes.buyerId, ids))),
    db.select().from(schema.alerts).where(eq(schema.alerts.agentId, agent.id)),
  ]);
  const { passwordHash: _hash, sessionVersion: _version, ...account } = agent;
  return { exportedAt: new Date().toISOString(), account, clients, homes, feedback, messages, voiceNotes, alerts };
}
