/**
 * Creates/updates database tables.
 * - With DATABASE_URL set: migrates that Postgres database.
 * - Without it: migrates the local embedded database in ./.data (also done automatically by `npm run dev`).
 */
import "./load-env";
import path from "node:path";
import { allowLocalDb, cleanDbUrl, dbSsl, MISSING_DB_MESSAGE } from "../src/lib/env";

async function main() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  // Migrations use the direct connection (Neon: DATABASE_URL_UNPOOLED); the app uses the pooled DATABASE_URL.
  const rawUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  const url = rawUrl ? cleanDbUrl(rawUrl) : undefined;

  if (url) {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: 1, prepare: false, ssl: dbSsl(url), connect_timeout: 30, onnotice: () => {} });
    await migrate(drizzle(client), { migrationsFolder });
    await client.end();
    console.log("✓ Migrated Postgres database");
  } else {
    if (!allowLocalDb()) throw new Error(MISSING_DB_MESSAGE);
    const fs = await import("node:fs");
    fs.mkdirSync(path.join(process.cwd(), ".data"), { recursive: true });
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const client = new PGlite(path.join(process.cwd(), ".data", "pglite"));
    await migrate(drizzle(client), { migrationsFolder });
    await client.close();
    console.log("✓ Migrated local database (.data/pglite). Set DATABASE_URL to use hosted Postgres.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
