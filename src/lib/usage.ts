import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb, schema } from "./db";

/**
 * Counts requests to services that are free only up to a monthly limit, and refuses the one
 * that would go over. Both happen in one statement, so two searches at once can't both sneak
 * past the limit.
 */

export const thisMonth = (now = new Date()) => now.toISOString().slice(0, 7);

/** Takes one request from this month's allowance. False when it's used up. */
export async function takeFromAllowance(service: string, monthlyLimit: number, now = new Date()): Promise<boolean> {
  if (monthlyLimit <= 0) return false;
  const db = await getDb();
  const month = thisMonth(now);
  await db.insert(schema.apiUsage).values({ service, month, count: 0 }).onConflictDoNothing();
  const taken = await db
    .update(schema.apiUsage)
    .set({ count: sql`${schema.apiUsage.count} + 1` })
    .where(and(eq(schema.apiUsage.service, service), eq(schema.apiUsage.month, month), lt(schema.apiUsage.count, monthlyLimit)))
    .returning({ count: schema.apiUsage.count });
  return taken.length > 0;
}

export async function usedThisMonth(service: string, now = new Date()): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ count: schema.apiUsage.count })
    .from(schema.apiUsage)
    .where(and(eq(schema.apiUsage.service, service), eq(schema.apiUsage.month, thisMonth(now))));
  return row?.count ?? 0;
}
