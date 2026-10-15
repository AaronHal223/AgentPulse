import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { SESSION_COOKIE, signSession, verifySession, sessionCookieOptions } from "./session";
import type { Agent } from "./db/schema";

export async function startSession(agentId: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(agentId), sessionCookieOptions);
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function currentAgent(): Promise<Agent | null> {
  const jar = await cookies();
  const agentId = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!agentId) return null;
  const db = await getDb();
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, agentId)).limit(1);
  return agent ?? null;
}

/** For pages: returns the logged-in agent or sends them to /login. */
export async function requireAgent(): Promise<Agent> {
  const agent = await currentAgent();
  if (!agent) redirect("/login");
  return agent;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** For API routes: returns the logged-in agent or throws 401. */
export async function apiAgent(): Promise<Agent> {
  const agent = await currentAgent();
  if (!agent) throw new HttpError(401, "Please log in.");
  return agent;
}
