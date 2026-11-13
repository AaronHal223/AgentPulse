import test, { before } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { schema, type DB } from "../src/lib/db";
import { markSent, setAgentVerdict } from "../src/lib/feedback";
import {
  activeShareLink,
  createShareLink,
  recordClientReaction,
  resolveShareToken,
  revokeShareLinks,
  sharedHomes,
} from "../src/lib/share-links";
import { makeAgent, makeBuyer, makeMatch, useTestDb } from "./helpers/db";

let db: DB;
before(async () => {
  db = await useTestDb();
});

async function clientWithLink() {
  const agent = await makeAgent(db);
  const buyer = await makeBuyer(db, agent.id, { notes: "private agent notes" });
  const { token, link } = await createShareLink(buyer.id);
  return { agent, buyer, token, link };
}

test("a link opens its own client's page and nothing else", async () => {
  const one = await clientWithLink();
  const two = await clientWithLink();
  assert.equal((await resolveShareToken(one.token))?.buyer.id, one.buyer.id);
  assert.equal((await resolveShareToken(two.token))?.buyer.id, two.buyer.id);
});

test("tokens are long, random, and never stored as plain text", async () => {
  const { token, link } = await clientWithLink();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, (await clientWithLink()).token);
  assert.ok(!JSON.stringify(link).includes(token));
});

test("unknown, malformed, revoked and expired links all fail the same way", async () => {
  const { buyer, token, link } = await clientWithLink();
  assert.equal(await resolveShareToken("x".repeat(43)), null);
  assert.equal(await resolveShareToken("../../etc/passwd"), null);
  assert.equal(await resolveShareToken(""), null);

  await db.update(schema.shareLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.shareLinks.id, link.id));
  assert.equal(await resolveShareToken(token), null, "expired");

  const fresh = await createShareLink(buyer.id);
  await revokeShareLinks(buyer.id);
  assert.equal(await resolveShareToken(fresh.token), null, "revoked");
  assert.equal(await activeShareLink(buyer.id), null);
});

test("making a new link retires the old one, and the agent can copy the current one again", async () => {
  const { buyer, token: old } = await clientWithLink();
  const { token: current } = await createShareLink(buyer.id);
  assert.equal(await resolveShareToken(old), null);
  assert.ok(await resolveShareToken(current));
  assert.equal((await activeShareLink(buyer.id))?.token, current);
});

test("the client sees only homes the agent sent, and only client-safe fields", async () => {
  const { buyer } = await clientWithLink();
  const sent = await makeMatch(db, buyer.id, { address: "1 Sent St", reasoning: "internal reasoning", cons: ["internal con"] });
  const unsent = await makeMatch(db, buyer.id, { address: "2 Unsent St" });
  const rejectedLater = await makeMatch(db, buyer.id, { address: "3 Rejected St" });
  await markSent(sent);
  await markSent(rejectedLater);
  await setAgentVerdict({ ...rejectedLater, status: "saved" }, "rejected", ["price"]);

  const homes = await sharedHomes(buyer.id);
  assert.deepEqual(homes.map((h) => h.address), ["1 Sent St"]);
  assert.ok(!homes.some((h) => h.id === unsent.id));
  const visible = Object.keys(homes[0]);
  for (const hidden of ["score", "baseScore", "reasoning", "pros", "cons", "status", "buyerId", "areaNote"]) {
    assert.ok(!visible.includes(hidden), `${hidden} must not reach the client`);
  }
});

test("a client can react only to homes on their own page", async () => {
  const mine = await clientWithLink();
  const other = await clientWithLink();
  const page = (await resolveShareToken(mine.token))!;

  const sent = await makeMatch(db, mine.buyer.id, { score: 7 });
  await markSent(sent);
  const unsent = await makeMatch(db, mine.buyer.id);
  const someoneElses = await makeMatch(db, other.buyer.id);
  await markSent(someoneElses);

  await assert.rejects(() => recordClientReaction(page, unsent.id, "liked"), /isn't on this page/);
  await assert.rejects(() => recordClientReaction(page, someoneElses.id, "liked"), /isn't on this page/);

  await recordClientReaction(page, sent.id, "liked", "  love the yard  ");
  const [home] = await sharedHomes(mine.buyer.id);
  assert.deepEqual([home.reaction, home.note], ["liked", "love the yard"]);
  const [row] = await db.select().from(schema.matches).where(eq(schema.matches.id, sent.id));
  assert.equal(row.score, 8, "a client's thumbs-up lifts that home");

  await recordClientReaction(page, sent.id, "disliked");
  assert.equal((await db.select().from(schema.matches).where(eq(schema.matches.id, sent.id)))[0].score, 5);

  await recordClientReaction(page, sent.id, null);
  assert.equal((await sharedHomes(mine.buyer.id))[0].reaction, null);
  assert.equal((await db.select().from(schema.matches).where(eq(schema.matches.id, sent.id)))[0].score, 7);
});
