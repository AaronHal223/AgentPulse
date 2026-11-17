import "server-only";
import { desc, eq, lt } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Agent, AppError, JobRun } from "./db/schema";
import { sendEmail } from "./brief";

/**
 * Keeps the site's owner informed: unexpected errors are saved for the status page and
 * emailed (at most once an hour), and each morning run leaves a line behind. Nothing here may
 * ever throw; a monitoring hiccup must not break the request it is watching.
 */

const KEEP_DAYS = 14;
const EMAIL_EVERY_MS = 60 * 60 * 1000;
let lastEmailAt = 0;

const ownerEmail = () => process.env.OWNER_EMAIL?.trim().toLowerCase() || null;

/** The person who runs this AgentPulse site (OWNER_EMAIL). Only they see the status page. */
export const isOwner = (agent: Pick<Agent, "email">) => ownerEmail() !== null && agent.email.toLowerCase() === ownerEmail();

const clean = (text: string) => text.replace(/\s+/g, " ").slice(0, 500);

async function emailOwner(source: string, message: string) {
  const to = ownerEmail();
  if (!to || !process.env.RESEND_API_KEY || Date.now() - lastEmailAt < EMAIL_EVERY_MS) return;
  lastEmailAt = Date.now();
  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  const text = `Something went wrong on AgentPulse.\n\nWhere: ${source}\nWhat: ${message}\n\nDetails: ${appUrl}/status\n\nYou get at most one of these emails an hour.`;
  await sendEmail(to, "AgentPulse: something needs a look", `<pre style="font:14px/1.5 Arial,sans-serif;white-space:pre-wrap">${text.replace(/[<>&]/g, "")}</pre>`, text);
}

/** Saves an unexpected problem for the status page and lets the owner know. Never throws. */
export async function recordError(source: string, err: unknown, opts: { email?: boolean } = {}): Promise<void> {
  const message = clean(err instanceof Error ? err.message : String(err));
  try {
    const db = await getDb();
    await db.insert(schema.appErrors).values({ source: clean(source), message });
    await db.delete(schema.appErrors).where(lt(schema.appErrors.createdAt, new Date(Date.now() - KEEP_DAYS * 24 * 3600 * 1000)));
    if (opts.email !== false) await emailOwner(source, message);
  } catch (inner) {
    console.error("could not record an error", inner);
  }
}

export async function recordJobRun(job: "search" | "briefs", run: { processed: number; failed: number; remaining?: number }): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(schema.jobRuns).values({ job, processed: run.processed, failed: run.failed, remaining: run.remaining ?? 0 });
    await db.delete(schema.jobRuns).where(lt(schema.jobRuns.createdAt, new Date(Date.now() - 60 * 24 * 3600 * 1000)));
  } catch (inner) {
    console.error("could not record a job run", inner);
  }
}

export async function recentErrors(limit = 20): Promise<AppError[]> {
  const db = await getDb();
  return db.select().from(schema.appErrors).orderBy(desc(schema.appErrors.createdAt)).limit(limit);
}

export async function lastJobRun(job: "search" | "briefs"): Promise<JobRun | null> {
  const db = await getDb();
  const [run] = await db.select().from(schema.jobRuns).where(eq(schema.jobRuns.job, job)).orderBy(desc(schema.jobRuns.createdAt)).limit(1);
  return run ?? null;
}
