import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { schema, type DB } from "../src/lib/db";
import type { Match } from "../src/lib/db/schema";
import { alertNewMatches, alertsForBrief, listAlerts, markAlertsRead, raiseAlerts, unreadAlertCount } from "../src/lib/alerts";
import { recheckSavedHomes } from "../src/lib/ai/recheck";
import { renderBriefEmail } from "../src/lib/brief";
import { checkedValues, detectChanges, newMatchAlert } from "../src/lib/listing-changes";
import { isPushEndpoint, pushToAgent, saveSubscription } from "../src/lib/push";
import { stubGemini } from "./helpers/ai";
import { makeAgent, makeBuyer, makeMatch, useTestDb } from "./helpers/db";

const home = (over: Partial<Match> = {}) =>
  ({ address: "12 Oak St", city: "Haddonfield", price: 500_000, listingType: "sale", listingStatus: "active", ...over }) as Match;

const kinds = (h: Match, check: Parameters<typeof detectChanges>[1]) => detectChanges(h, check).map((d) => d.kind);

test("a lower price on a live listing is a price drop", () => {
  const [drop] = detectChanges(home(), { status: "active", price: 475_000 });
  assert.equal(drop.kind, "price_drop");
  assert.match(drop.body, /\$500,000 → \$475,000 \(down 5%\)/);
  assert.deepEqual(drop.data, { oldPrice: 500_000, newPrice: 475_000 });
});

test("rounding noise, price rises and unknown prices are not alerts", () => {
  assert.deepEqual(kinds(home(), { status: "active", price: 499_000 }), []);
  assert.deepEqual(kinds(home(), { status: "active", price: 520_000 }), []);
  assert.deepEqual(kinds(home({ price: null }), { status: "active", price: 400_000 }), []);
  assert.deepEqual(kinds(home(), { status: "active" }), []);
});

test("status changes and back-on-market are told apart", () => {
  assert.deepEqual(kinds(home(), { status: "pending" }), ["status_change"]);
  assert.deepEqual(kinds(home(), { status: "sold" }), ["status_change"]);
  assert.deepEqual(kinds(home({ listingStatus: "pending" }), { status: "active" }), ["back_on_market"]);
  assert.deepEqual(kinds(home({ listingStatus: "off_market" }), { status: "active", price: 450_000 }), ["back_on_market", "price_drop"]);
  assert.deepEqual(kinds(home({ listingStatus: "pending" }), { status: "pending" }), []);
});

test("an inconclusive check raises nothing and changes nothing but the check time", () => {
  assert.deepEqual(detectChanges(home(), { status: "unknown", price: 1 }), []);
  assert.deepEqual(Object.keys(checkedValues({ status: "unknown", price: 1 })), ["lastCheckedAt"]);
  const values = checkedValues({ status: "pending", price: 480_000.4 });
  assert.deepEqual([values.listingStatus, values.price], ["pending", 480_000]);
});

test("a sold home with a lower final price is only a status change", () => {
  assert.deepEqual(kinds(home(), { status: "sold", price: 450_000 }), ["status_change"]);
});

test("only in-area homes scoring 8+ count as a strong new match", () => {
  const buyer = { name: "Pat" };
  const m = (score: number, inArea = true) => ({ ...home(), score, inArea }) as Match;
  assert.equal(newMatchAlert(buyer, m(8))?.title, "8/10 match for Pat");
  assert.equal(newMatchAlert(buyer, m(7)), null);
  assert.equal(newMatchAlert(buyer, m(10, false)), null);
});

test("only real push services are accepted as notification addresses", () => {
  assert.ok(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"));
  assert.ok(isPushEndpoint("https://web.push.apple.com/QGk"));
  assert.ok(isPushEndpoint("https://wns2-by3p.notify.windows.com/w/?token=1"));
  for (const bad of ["http://fcm.googleapis.com/x", "https://evil.example/fcm.googleapis.com", "https://fcm.googleapis.com.evil.example/x", "https://localhost:5432/", "nonsense"]) {
    assert.ok(!isPushEndpoint(bad), bad);
  }
});

let db: DB;
let ai: Awaited<ReturnType<typeof stubGemini>>;
before(async () => {
  db = await useTestDb();
  ai = await stubGemini(() => ({ listings: [] }));
});
after(() => ai.close());

const draft = { kind: "price_drop" as const, title: "Price drop", body: "Was more", data: {} };

async function agentWithHome(values: Parameters<typeof makeMatch>[2] = {}) {
  const agent = await makeAgent(db);
  const buyer = await makeBuyer(db, agent.id);
  const match = await makeMatch(db, buyer.id, values);
  return { agent, buyer, match, target: { agentId: agent.id, buyerId: buyer.id, matchId: match.id } };
}

test("agents see and mark only their own alerts", async () => {
  const mine = await agentWithHome();
  const theirs = await agentWithHome();
  await raiseAlerts(mine.target, [draft]);
  const [other] = await raiseAlerts(theirs.target, [draft]);

  assert.equal((await listAlerts(mine.agent.id)).length, 1);
  assert.equal((await listAlerts(mine.agent.id))[0].buyerName, "Test Client");

  // Even with the other agent's alert id, or "mark everything", nothing of theirs changes.
  await markAlertsRead(mine.agent.id, [other.id]);
  await markAlertsRead(mine.agent.id);
  assert.equal(await unreadAlertCount(mine.agent.id), 0);
  assert.equal(await unreadAlertCount(theirs.agent.id), 1);
});

test("a subscription to an unknown host is refused, and push stays quiet without keys", async () => {
  const { agent } = await agentWithHome();
  await assert.rejects(() => saveSubscription(agent.id, { endpoint: "https://internal.example/hook", keys: { p256dh: "a", auth: "b" } }), /isn't supported/);
  assert.equal(await pushToAgent(agent.id, { title: "t", body: "b", url: "/alerts" }), 0);
});

test("new 8+ matches raise one alert each", async () => {
  const { agent, buyer } = await agentWithHome();
  const strong = await makeMatch(db, buyer.id, { score: 9, address: "9 Strong St" });
  const fine = await makeMatch(db, buyer.id, { score: 7 });
  const raised = await alertNewMatches(agent.id, buyer, [strong, fine]);
  assert.deepEqual(raised.map((a) => [a.kind, a.matchId]), [["new_match", strong.id]]);
});

test("re-checking saved homes records what changed and raises alerts", async () => {
  const { agent, buyer, match } = await agentWithHome({ status: "saved", price: 600_000, address: "1 Saved St", url: "https://example.com/saved-1" });
  const pending = await makeMatch(db, buyer.id, { status: "saved", price: 400_000, url: "https://example.com/saved-2" });
  const skipped = await makeMatch(db, buyer.id, { status: "saved", url: "https://example.com/saved-3" });
  const notSaved = await makeMatch(db, buyer.id, { url: "https://example.com/not-saved" });

  ai.setReply(() => ({
    listings: [
      { url: "https://example.com/saved-1", status: "active", price: 570000 },
      { url: "https://example.com/saved-2", status: "pending", price: null },
      { url: "https://example.com/someone-elses-home", status: "sold" },
    ],
  }));
  const result = await recheckSavedHomes(agent, buyer, { push: false });

  assert.equal(result.homes.length, 3);
  assert.deepEqual(result.alerts.map((a) => a.kind).sort(), ["price_drop", "status_change"]);
  const row = async (id: string) => (await db.select().from(schema.matches).where(eq(schema.matches.id, id)))[0];
  assert.equal((await row(match.id)).price, 570_000);
  assert.equal((await row(pending.id)).listingStatus, "pending");
  assert.equal((await row(pending.id)).price, 400_000, "a missing price leaves the old one alone");
  assert.ok((await row(skipped.id)).lastCheckedAt, "homes the AI skipped still count as looked at");
  assert.equal((await row(notSaved.id)).lastCheckedAt, null);
  assert.ok(!ai.prompts.at(-1)!.includes("not-saved"), "only saved homes are sent for re-checking");

  // A second look with nothing new stays quiet.
  ai.setReply(() => ({ listings: [{ url: "https://example.com/saved-1", status: "active", price: 570000 }] }));
  assert.equal((await recheckSavedHomes(agent, buyer, { push: false })).alerts.length, 0);
});

test("the brief email leads with changes on saved homes, safely escaped", async () => {
  const { agent, target } = await agentWithHome();
  await raiseAlerts(target, [{ ...draft, title: "Price drop: <b>12 Oak St</b>" }, { ...draft, kind: "new_match", title: "9/10 match" }], { push: false });
  const pendingForBrief = await alertsForBrief(agent.id);
  assert.equal(pendingForBrief.length, 2);

  const changes = pendingForBrief.filter((a) => a.kind !== "new_match");
  const email = renderBriefEmail(agent, [], "https://app.example", changes);
  assert.match(email.subject, /^1 update on saved homes — /);
  assert.match(email.html, /Changes on saved homes/);
  assert.match(email.html, /&lt;b&gt;12 Oak St&lt;\/b&gt;/);
  assert.match(email.text, /Changes on saved homes/);
});
