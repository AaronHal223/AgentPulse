/**
 * Creates/updates database tables.
 * - With DATABASE_URL set: migrates that Postgres database.
 * - Without it: migrates the local embedded database in ./.data (also done automatically by `npm run dev`).
 */
import path from "node:path";

async function main() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const url = process.env.DATABASE_URL;

  if (url) {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: 1, prepare: false });
    await migrate(drizzle(client), { migrationsFolder });
    await client.end();
    console.log("✓ Migrated Postgres database");
  } else {
    if (process.env.VERCEL) {
      throw new Error("DATABASE_URL is not set. Add a Postgres connection string (e.g. a free Neon database) in your Vercel project settings.");
    }
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
