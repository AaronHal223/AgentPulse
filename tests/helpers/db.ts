import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../src/lib/db/schema";
import type { DB } from "../../src/lib/db";

/**
 * Points the app's `getDb()` at a fresh in-memory database with every migration applied.
 * Call it at the top of a test file; each file gets its own database.
 */
export async function useTestDb(): Promise<DB> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  (globalThis as unknown as { __agentpulseDb?: Promise<DB> }).__agentpulseDb = Promise.resolve(db as unknown as DB);
  return db as unknown as DB;
}

let counter = 0;

export async function makeAgent(db: DB, name = "Agent") {
  const [agent] = await db
    .insert(schema.agents)
    .values({ name, email: `agent-${++counter}@example.com`, passwordHash: "x" })
    .returning();
  return agent;
}

export async function makeBuyer(db: DB, agentId: string, values: Partial<schema.NewBuyer> = {}) {
  const [buyer] = await db.insert(schema.buyers).values({ agentId, name: "Test Client", ...values }).returning();
  return buyer;
}

export async function makeMatch(db: DB, buyerId: string, values: Partial<typeof schema.matches.$inferInsert> = {}) {
  const [match] = await db
    .insert(schema.matches)
    .values({ buyerId, url: `https://example.com/home/${++counter}`, score: 7, ...values })
    .returning();
  return match;
}
