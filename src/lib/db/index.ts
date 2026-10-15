import "server-only";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __agentpulseDb?: Promise<DB> };

async function init(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    // Production / hosted Postgres (Neon, Supabase, Vercel Postgres, RDS...).
    // Run `npm run db:migrate` (the build does this automatically) to create tables.
    const client = postgres(url, { max: 5, prepare: false });
    return drizzlePg(client, { schema });
  }

  if (process.env.VERCEL) {
    throw new Error(
      "DATABASE_URL is not set. AgentPulse needs a hosted Postgres database in production (e.g. a free Neon database). See README.",
    );
  }

  // Local development: embedded Postgres (PGlite) stored in ./.data, auto-migrated.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzleLite } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const path = await import("node:path");
  const fs = await import("node:fs");
  fs.mkdirSync(path.join(process.cwd(), ".data"), { recursive: true });
  const client = new PGlite(path.join(process.cwd(), ".data", "pglite"));
  const db = drizzleLite(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!globalForDb.__agentpulseDb) {
    globalForDb.__agentpulseDb = init().catch((err) => {
      globalForDb.__agentpulseDb = undefined;
      throw err;
    });
  }
  return globalForDb.__agentpulseDb;
}

export { schema };
