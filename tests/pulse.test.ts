import test, { before } from "node:test";
import assert from "node:assert/strict";
import { schema, type DB } from "../src/lib/db";
import { markSent } from "../src/lib/feedback";
import { callReason, pulseOf, type PulseSignals } from "../src/lib/pulse";
import { callList, clientPulses } from "../src/lib/pulse-data";
import { estimateMinutesSaved, formatMinutes, weeklyReport } from "../src/lib/report";
import { makeAgent, makeBuyer, makeMatch, useTestDb } from "./helpers/db";

const quiet: PulseSignals = {
  likes: 0,
  passes: 0,
  notes: 0,
  daysSinceClientActivity: null,
  awaitingReaction: 0,
  daysSinceLastSend: null,
  strongUnsent: 0,
  agentNotes: 0,
  daysSinceAgentActivity: null,
};
const signals = (over: Partial<PulseSignals>): PulseSignals => ({ ...quiet, ...over });

test("a client who just liked homes is hot; one with no activity is quiet", () => {
  assert.deepEqual(pulseOf(quiet), { score: 0, level: "quiet" });
  const engaged = pulseOf(signals({ likes: 2, notes: 1, daysSinceClientActivity: 1, agentNotes: 2 }));
  assert.equal(engaged.level, "hot");
  assert.ok(engaged.score <= 100);
  assert.equal(pulseOf(signals({ passes: 1, daysSinceClientActivity: 6 })).level, "cooling");
  assert.equal(pulseOf(signals({ likes: 1, daysSinceClientActivity: 5 })).level, "warm");
  assert.equal(pulseOf(signals({ likes: 9, passes: 9, notes: 9, daysSinceClientActivity: 0, agentNotes: 9, awaitingReaction: 1, daysSinceLastSend: 0 })).score, 100);
});

test("the reason to call follows what happened most recently", () => {
  assert.match(callReason(signals({ likes: 2, daysSinceClientActivity: 1 }))!.reason, /Liked 2 homes/);
  assert.match(callReason(signals({ passes: 3, daysSinceClientActivity: 2 }))!.reason, /Passed on 3 homes in a row/);
  assert.match(callReason(signals({ strongUnsent: 1 }))!.reason, /1 strong match \(8\+\)/);
  assert.match(callReason(signals({ awaitingReaction: 2, daysSinceLastSend: 5 }))!.reason, /No reaction to 2 homes you sent 5 days ago/);
  assert.match(callReason(signals({ daysSinceAgentActivity: 20 }))!.reason, /No contact in 20 days/);
  assert.equal(callReason(quiet), null, "a brand-new client with nothing going on isn't a call");
  assert.equal(callReason(signals({ awaitingReaction: 2, daysSinceLastSend: 1 })), null, "give them a few days to react");
});

test("a fresh like outranks unsent matches, which outrank a long silence", () => {
  const like = callReason(signals({ likes: 1, daysSinceClientActivity: 0, strongUnsent: 3 }))!;
  const unsent = callReason(signals({ strongUnsent: 3 }))!;
  const silent = callReason(signals({ daysSinceAgentActivity: 30 }))!;
  assert.ok(like.priority > unsent.priority && unsent.priority > silent.priority);
});

test("time saved is simple arithmetic the agent can check", () => {
  assert.equal(estimateMinutesSaved({ homesFound: 10, alerts: 2, homesSent: 3, voiceNotes: 1 }), 60 + 10 + 6 + 3);
  assert.equal(formatMinutes(79), "1 h 19 min");
  assert.equal(formatMinutes(120), "2 h");
  assert.equal(formatMinutes(0), "0 min");
});

let db: DB;
before(async () => {
  db = await useTestDb();
});

test("pulses and the call list only ever cover the agent's own active clients", async () => {
  const me = await makeAgent(db);
  const other = await makeAgent(db);
  const keen = await makeBuyer(db, me.id, { name: "Keen" });
  const idle = await makeBuyer(db, me.id, { name: "Idle" });
  await makeBuyer(db, me.id, { name: "Paused", active: false });
  const theirs = await makeBuyer(db, other.id, { name: "Not mine" });

  const sent = await makeMatch(db, keen.id, { score: 7 });
  await markSent(sent);
  await db.insert(schema.matchFeedback).values({ matchId: sent.id, buyerId: keen.id, source: "client", verdict: "liked", note: "love it" });
  await makeMatch(db, idle.id, { score: 9 });
  await makeMatch(db, theirs.id, { score: 10 });

  const pulses = await clientPulses(me.id);
  assert.deepEqual(pulses.map((p) => p.buyer.name).sort(), ["Idle", "Keen"]);
  const byName = Object.fromEntries(pulses.map((p) => [p.buyer.name, p]));
  assert.ok(byName.Keen.pulse.score > byName.Idle.pulse.score);

  const calls = callList(pulses);
  assert.deepEqual(calls.map((c) => c.buyer.name), ["Keen", "Idle"]);
  assert.match(calls[0].call.reason, /Liked 1 home/);
  assert.match(calls[1].call.reason, /strong match/);
});

test("the weekly report counts this agent's last seven days and nothing else", async () => {
  const me = await makeAgent(db);
  const other = await makeAgent(db);
  const client = await makeBuyer(db, me.id, { name: "Report Client" });
  const theirs = await makeBuyer(db, other.id);
  const longAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const strong = await makeMatch(db, client.id, { score: 9 });
  await makeMatch(db, client.id, { score: 5 });
  await makeMatch(db, client.id, { score: 9, createdAt: longAgo });
  await makeMatch(db, theirs.id, { score: 9 });
  await markSent(strong);
  await db.insert(schema.matchFeedback).values({ matchId: strong.id, buyerId: client.id, source: "client", verdict: "disliked" });
  await db.insert(schema.alerts).values({ agentId: me.id, buyerId: client.id, matchId: strong.id, kind: "price_drop", title: "t", body: "b" });
  await db.insert(schema.voiceNotes).values({ buyerId: client.id, transcript: "note" });

  const report = await weeklyReport(me.id);
  assert.deepEqual(report.counts, { homesFound: 2, strongMatches: 1, homesSent: 1, likes: 0, passes: 1, clientNotes: 0, alerts: 1, priceDrops: 1, voiceNotes: 1 });
  assert.equal(report.minutesSaved, 2 * 6 + 5 + 2 + 3);
  assert.deepEqual(report.clients, [{ buyerId: client.id, name: "Report Client", found: 2, sent: 1, likes: 0, passes: 1 }]);
});
