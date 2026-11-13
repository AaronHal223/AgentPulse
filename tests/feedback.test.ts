import test, { before } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { schema, type DB } from "../src/lib/db";
import { getOwnedMatch, loadFeedback, markSent, setAgentVerdict } from "../src/lib/feedback";
import { makeAgent, makeBuyer, makeMatch, useTestDb } from "./helpers/db";

let db: DB;
before(async () => {
  db = await useTestDb();
});

const scoreOf = async (id: string) => (await db.select().from(schema.matches).where(eq(schema.matches.id, id)))[0].score;

test("an agent can't reach another agent's home", async () => {
  const [mine, theirs] = [await makeAgent(db), await makeAgent(db)];
  const match = await makeMatch(db, (await makeBuyer(db, mine.id)).id);
  assert.equal((await getOwnedMatch(mine.id, match.id)).match.id, match.id);
  await assert.rejects(() => getOwnedMatch(theirs.id, match.id), /not found/i);
});

test("rejecting for price lowers similar homes, and undo restores them", async () => {
  const buyer = await makeBuyer(db, (await makeAgent(db)).id);
  const pricey = await makeMatch(db, buyer.id, { price: 600_000, city: "A", score: 7 });
  const similar = await makeMatch(db, buyer.id, { price: 610_000, city: "B", score: 8 });
  const cheaper = await makeMatch(db, buyer.id, { price: 500_000, city: "C", score: 6 });

  const moved = await setAgentVerdict(pricey, "rejected", ["price"]);
  assert.deepEqual(moved, [{ id: similar.id, score: 7 }]);
  assert.equal(await scoreOf(cheaper.id), 6);
  assert.equal(await scoreOf(pricey.id), 7, "the rejected home keeps its own score");

  const [entry] = await loadFeedback(buyer.id);
  assert.deepEqual([entry.verdict, entry.reasons], ["rejected", ["price"]]);

  const restored = await setAgentVerdict({ ...pricey, status: "dismissed" }, null);
  assert.deepEqual(restored, [{ id: similar.id, score: 8 }]);
  assert.equal((await loadFeedback(buyer.id)).length, 0);
});

test("feedback never compounds: rescoring always starts from the base score", async () => {
  const buyer = await makeBuyer(db, (await makeAgent(db)).id);
  const a = await makeMatch(db, buyer.id, { price: 600_000, city: "A" });
  const b = await makeMatch(db, buyer.id, { price: 600_000, city: "B" });
  const target = await makeMatch(db, buyer.id, { price: 650_000, city: "C", score: 9 });
  await setAgentVerdict(a, "rejected", ["price"]);
  await setAgentVerdict(a, "rejected", ["price"]);
  assert.equal(await scoreOf(target.id), 8);
  await setAgentVerdict(b, "rejected", ["price"]);
  assert.equal(await scoreOf(target.id), 7);
});

test("one verdict per home: saving after rejecting replaces it", async () => {
  const buyer = await makeBuyer(db, (await makeAgent(db)).id);
  const match = await makeMatch(db, buyer.id);
  await setAgentVerdict(match, "rejected", ["layout"]);
  await setAgentVerdict(match, "saved");
  const entries = await loadFeedback(buyer.id);
  assert.equal(entries.length, 1);
  assert.deepEqual([entries[0].verdict, entries[0].reasons], ["saved", []]);
});

test("sending a home saves it and stamps when it was sent", async () => {
  const buyer = await makeBuyer(db, (await makeAgent(db)).id);
  const match = await makeMatch(db, buyer.id);
  await markSent(match);
  const [row] = await db.select().from(schema.matches).where(eq(schema.matches.id, match.id));
  assert.equal(row.status, "saved");
  assert.ok(row.sentAt);
});
