import test, { before } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { schema, type DB } from "../src/lib/db";
import { dueForRecheck, dueForSearch, isDueForSearch } from "../src/lib/daily";
import { runAgent } from "../src/lib/ai/provider";
import { HttpError } from "../src/lib/errors";
import { fairHousingFlags, keepFairCopy } from "../src/lib/fair-housing";
import { atClock, toIcs } from "../src/lib/ics";
import { makeAgent, makeBuyer, useTestDb } from "./helpers/db";

test("steering phrases are flagged; plain facts about the home are not", () => {
  const risky = [
    "Perfect for a young family.",
    "It's in a safe neighborhood.",
    "Great schools nearby.",
    "A quiet white neighborhood.",
    "Adults only building.",
    "Ideal for empty-nesters.",
    "Low-crime area.",
    "Not for kids.",
  ];
  for (const text of risky) assert.ok(fairHousingFlags(text).length, text);
  const fine = [
    "Four bedrooms, a fenced yard and a finished basement.",
    "Two blocks from Central School and a 14-minute drive to Cooper.",
    "Walk to the PATCO station and Haddon Ave shops.",
    "The family room opens onto the deck.",
    "Quiet cul-de-sac with a new roof.",
  ];
  for (const text of fine) assert.deepEqual(fairHousingFlags(text), [], text);
});

test("only the sentences that trip the check are dropped", () => {
  assert.equal(keepFairCopy("Big yard. Safe neighborhood for kids! New roof."), "Big yard. New roof.");
  assert.equal(keepFairCopy("Updated kitchen."), "Updated kitchen.");
  assert.equal(keepFairCopy("Great schools."), "");
});

test("quiet clients are searched every three days, active ones daily", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 3600 * 1000);
  assert.equal(isDueForSearch(null, daysAgo(100), now), true, "never searched");
  assert.equal(isDueForSearch(daysAgo(1), daysAgo(2), now), true, "active, searched yesterday");
  assert.equal(isDueForSearch(daysAgo(0.5), daysAgo(2), now), false, "active, searched this morning");
  assert.equal(isDueForSearch(daysAgo(1), daysAgo(30), now), false, "quiet, searched yesterday");
  assert.equal(isDueForSearch(daysAgo(3), daysAgo(30), now), true, "quiet, three days on");
});

let db: DB;
before(async () => {
  db = await useTestDb();
});

test("the morning run waits quietly while the AI isn't switched on", async () => {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  process.env.AI_PROVIDER = "gemini";
  const waiting = await makeBuyer(db, (await makeAgent(db)).id, { lastSearchedAt: null });
  assert.deepEqual(await dueForSearch(), []);
  assert.deepEqual(await dueForRecheck(), []);
  await assert.rejects(() => runAgent({ system: "", messages: [{ role: "user", content: "hi" }] } as never), (err: HttpError) => err.status === 503 && /isn't switched on/.test(err.message));
  if (saved) process.env.GEMINI_API_KEY = saved;
  await db.delete(schema.buyers).where(eq(schema.buyers.id, waiting.id));
});

test("the morning run stops at the daily search cap and skips quiet clients", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.AI_DAILY_SEARCHES = "2";
  const agent = await makeAgent(db);
  const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
  const yesterday = new Date(Date.now() - 26 * 3600 * 1000);
  const quiet = await makeBuyer(db, agent.id, { name: "Quiet", lastSearchedAt: yesterday, createdAt: old, updatedAt: old });
  const a = await makeBuyer(db, agent.id, { name: "A", lastSearchedAt: null });
  const b = await makeBuyer(db, agent.id, { name: "B", lastSearchedAt: yesterday });
  const c = await makeBuyer(db, agent.id, { name: "C", lastSearchedAt: yesterday });

  let due = (await dueForSearch()).map((d) => d.buyer.name);
  assert.ok(!due.includes("Quiet"));
  assert.equal(due.length, 2, "never more than the cap");
  assert.equal(due[0], "A", "longest waiting first");

  // One search already happened today, so only one more fits.
  await db.update(schema.buyers).set({ lastSearchedAt: new Date() }).where(eq(schema.buyers.id, a.id));
  due = (await dueForSearch()).map((d) => d.buyer.name);
  assert.equal(due.length, 1);
  assert.ok([b.name, c.name].includes(due[0]));
  assert.ok(quiet);
  delete process.env.AI_DAILY_SEARCHES;
});

test("a tour becomes a calendar file every calendar app can open", () => {
  const start = atClock("2026-11-21", "10:00");
  assert.equal(start.getHours(), 10);
  const ics = toIcs(
    [{ uid: "m1-2026-11-21", title: "Showing 1/2: 12 Oak St, Pat; Lee", start, end: atClock("2026-11-21", "10:30"), location: "12 Oak St, Haddonfield, NJ", notes: "Route: https://example.com/" + "x".repeat(120) }],
    new Date("2026-11-17T12:00:00Z"),
  );
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261121T100000\r\n/);
  assert.match(ics, /DTEND:20261121T103000\r\n/);
  assert.match(ics, /SUMMARY:Showing 1\/2: 12 Oak St\\, Pat\; Lee\r\n/);
  assert.match(ics, /DTSTAMP:20261117T120000Z/);
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});
