import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { schema, type DB } from "../src/lib/db";
import { draftFollowUp, homesToMention } from "../src/lib/ai/follow-up";
import { markSent, setAgentVerdict } from "../src/lib/feedback";
import { stubGemini } from "./helpers/ai";
import { makeAgent, makeBuyer, makeMatch, useTestDb } from "./helpers/db";

let db: DB;
let ai: Awaited<ReturnType<typeof stubGemini>>;
before(async () => {
  db = await useTestDb();
  ai = await stubGemini(() => ({ subject: "Two homes for you", body: "  Hi Pat, two homes came up.  " }));
});
after(() => ai.close());

test("a draft mentions unsent homes first and skips rejected, reacted-to and weak ones", async () => {
  const buyer = await makeBuyer(db, (await makeAgent(db)).id);
  const sentEarlier = await makeMatch(db, buyer.id, { score: 9, address: "Sent St" });
  await markSent(sentEarlier);
  const fresh = await makeMatch(db, buyer.id, { score: 8, address: "Fresh St" });
  const rejected = await makeMatch(db, buyer.id, { score: 10, address: "Rejected St" });
  await setAgentVerdict(rejected, "rejected", ["price"]);
  const reacted = await makeMatch(db, buyer.id, { score: 9, address: "Reacted St" });
  await markSent(reacted);
  await db.insert(schema.matchFeedback).values({ matchId: reacted.id, buyerId: buyer.id, source: "client", verdict: "liked" });
  await makeMatch(db, buyer.id, { score: 3, address: "Weak St" });
  await makeMatch(db, buyer.id, { score: 9, address: "Outside St", inArea: false });
  await makeMatch(db, buyer.id, { score: 9, address: "Sold St", listingStatus: "sold" });

  assert.deepEqual((await homesToMention(buyer.id)).map((h) => h.address), ["Fresh St", "Sent St"]);
});

test("the draft is written in the agent's voice, about this client's homes only", async () => {
  const agent = { ...(await makeAgent(db, "Dana Rivera")), tone: "Short and warm. Sign off — Dana" };
  const buyer = await makeBuyer(db, agent.id, { name: "Pat Client" });
  const other = await makeBuyer(db, (await makeAgent(db)).id);
  await makeMatch(db, buyer.id, { score: 9, address: "12 Mine St", blurb: "Great yard" });
  await makeMatch(db, other.id, { score: 10, address: "99 Someone Elses Ave" });

  const text = await draftFollowUp(agent, buyer, "text", "https://app.example/s/token");
  assert.deepEqual([text.subject, text.body, text.homes.length], [null, "Hi Pat, two homes came up.", 1]);

  const prompt = ai.prompts.at(-1)!;
  assert.match(prompt, /12 Mine St/);
  assert.match(prompt, /Sign off — Dana/);
  assert.match(prompt, /app\.example\/s\/token/);
  assert.doesNotMatch(prompt, /Someone Elses/);

  const email = await draftFollowUp(agent, buyer, "email", null);
  assert.equal(email.subject, "Two homes for you");
});

test("with nothing new to say, or an empty draft, the agent gets a clear message", async () => {
  const agent = await makeAgent(db);
  const empty = await makeBuyer(db, agent.id);
  await assert.rejects(() => draftFollowUp(agent, empty, "text", null), /nothing new to write about/);

  const buyer = await makeBuyer(db, agent.id);
  await makeMatch(db, buyer.id, { score: 9 });
  ai.setReply(() => ({ body: "   " }));
  await assert.rejects(() => draftFollowUp(agent, buyer, "text", null), /came back empty/);
});
