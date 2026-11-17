import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { SESSION_COOKIE, readSession, signSession, sessionCookieOptions } from "./session";
import type { Agent } from "./db/schema";
import { HttpError } from "./errors";

export async function startSession(agent: Pick<Agent, "id" | "sessionVersion">) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(agent.id, agent.sessionVersion), sessionCookieOptions);
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

async function sessionAgent(): Promise<{ agent: Agent | null; staleCookie: boolean }> {
  const jar = await cookies();
  const claims = await readSession(jar.get(SESSION_COOKIE)?.value);
  if (!claims) return { agent: null, staleCookie: false };
  const db = await getDb();
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, claims.agentId)).limit(1);
  // A valid cookie for an account that's gone (deleted, or a different database), or one
  // from before the password was changed.
  if (!agent || agent.sessionVersion !== claims.version) return { agent: null, staleCookie: true };
  return { agent, staleCookie: false };
}

export async function currentAgent(): Promise<Agent | null> {
  return (await sessionAgent()).agent;
}

/** For pages: returns the logged-in agent or sends them to /login. */
export async function requireAgent(): Promise<Agent> {
  const { agent, staleCookie } = await sessionAgent();
  // Clear a stale cookie first. Otherwise /login bounces back to /dashboard and the browser
  // gets stuck in a redirect loop ("this page isn't working").
  if (staleCookie) redirect("/api/auth/expired");
  if (!agent) redirect("/login");
  return agent;
}

export { HttpError };

/** For API routes: returns the logged-in agent or throws 401. */
export async function apiAgent(): Promise<Agent> {
  const agent = await currentAgent();
  if (!agent) throw new HttpError(401, "Please log in.");
  return agent;
}
