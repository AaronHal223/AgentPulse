import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/** A copy of the migrations folder that stops after the first `count` migrations. */
function firstMigrations(count: number) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentpulse-migrations-"));
  fs.cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.slice(0, count);
  fs.writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

test("new migrations run on a database that already has clients and homes, without losing any", async () => {
  const client = new PGlite();
  const db = drizzle(client);

  // The database as it is in production today.
  await migrate(db, { migrationsFolder: firstMigrations(1) });
  await client.exec(`
    insert into agents (id, email, password_hash, name) values ('a1', 'a@example.com', 'x', 'Agent');
    insert into buyers (id, agent_id, name) values ('b1', 'a1', 'Client');
    insert into messages (id, buyer_id, role, content) values ('msg1', 'b1', 'user', 'hello');
    insert into matches (id, buyer_id, url, score, status) values
      ('m1', 'b1', 'https://example.com/1', 9, 'saved'),
      ('m2', 'b1', 'https://example.com/2', 3, 'dismissed'),
      ('m3', 'b1', 'https://example.com/3', 6, 'new');
  `);

  await migrate(db, { migrationsFolder: MIGRATIONS });
  // Running them again must be a no-op, as it is on every deploy.
  await migrate(db, { migrationsFolder: MIGRATIONS });

  const count = async (table: string) => Number((await client.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n);
  assert.equal(await count("agents"), 1);
  assert.equal(await count("buyers"), 1);
  assert.equal(await count("messages"), 1);
  assert.equal(await count("matches"), 3);

  const scores = await client.query<{ id: string; score: number }>("select id, score from matches order by id");
  assert.deepEqual(scores.rows.map((r) => r.score), [9, 3, 6]);

  const feedback = await client.query<{ match_id: string; verdict: string }>("select match_id, verdict from match_feedback order by match_id");
  assert.deepEqual(feedback.rows, [
    { match_id: "m1", verdict: "saved" },
    { match_id: "m2", verdict: "rejected" },
  ]);
});
