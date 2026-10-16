import "server-only";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { allowLocalDb, dbSsl, MISSING_DB_MESSAGE } from "../env";

export type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __agentpulseDb?: Promise<DB> };

async function init(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    // Production / hosted Postgres. On Neon, DATABASE_URL is the pooled (-pooler) string — right for
    // app traffic; migrations use DATABASE_URL_UNPOOLED. `npm run build` creates the tables.
    const client = postgres(url, {
      max: 5,
      prepare: false, // works with connection poolers (Neon's -pooler host)
      ssl: dbSsl(url), // never send client data over an unencrypted connection
      connect_timeout: 15, // a sleeping Neon database takes ~1s to wake
      idle_timeout: 20, // drop idle sockets before the database host does
      max_lifetime: 60 * 30,
    });
    return drizzlePg(client, { schema });
  }

  // The embedded database lives on the server's disk, which hosts like Render wipe on every
  // restart — so it is only for local development and CI, never for real clients.
  if (!allowLocalDb()) throw new Error(MISSING_DB_MESSAGE);

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
