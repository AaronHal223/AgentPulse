import test, { before } from "node:test";
import assert from "node:assert/strict";
import type { Anchor, Match } from "../src/lib/db/schema";
import { commuteFit, commutesTo, defaultCommutePlaces, longestCommute, togglePlace } from "../src/lib/commute";
import { refreshDriveTimes } from "../src/lib/drive-times";
import type { DB } from "../src/lib/db";
import { makeAgent, makeBuyer, makeMatch, useTestDb } from "./helpers/db";

const home = (distances: Match["distances"]) => ({ distances });
const anchors = ["Her work", "His work", "School"].map((label) => ({ label, address: `${label} address` })) as Anchor[];

test("the first two important places are compared by default, and never more than two", () => {
  assert.deepEqual(defaultCommutePlaces(anchors), ["Her work", "His work"]);
  assert.deepEqual(togglePlace(["Her work", "His work"], "School"), ["His work", "School"]);
  assert.deepEqual(togglePlace(["Her work", "His work"], "Her work"), ["His work"]);
  assert.deepEqual(togglePlace([], "School"), ["School"]);
});

test("a home fits only if every chosen place is within the limit", () => {
  const h = home([
    { label: "Her work", minutes: 20, miles: 9 },
    { label: "His work", minutes: 41, miles: 24 },
    { label: "School", minutes: 5, miles: 1 },
  ]);
  assert.equal(longestCommute(h, ["Her work", "His work"]), 41);
  assert.equal(commuteFit(h, ["Her work", "His work"], 30), "over");
  assert.equal(commuteFit(h, ["Her work"], 30), "within");
  assert.equal(commuteFit(h, ["Her work", "School"], 20), "within");
  assert.deepEqual(commutesTo(h, ["School", "Her work"]).map((d) => d.label), ["School", "Her work"]);
});

test("homes without drive times, or with no limit set, are never treated as too far", () => {
  const milesOnly = home([{ label: "Her work", minutes: null, miles: 30 }]);
  assert.equal(commuteFit(milesOnly, ["Her work"], 10), "unknown");
  assert.equal(commuteFit(home([]), ["Her work"], 10), "unknown");
  assert.equal(commuteFit(home([{ label: "Her work", minutes: 90, miles: 60 }]), ["Her work"], null), "unknown");
  assert.equal(commuteFit(home([{ label: "Her work", minutes: 90, miles: 60 }]), [], 10), "unknown");
});

let db: DB;
before(async () => {
  db = await useTestDb();
  delete process.env.ORS_API_KEY; // no network in tests: distances fall back to straight-line miles
});

test("refreshing drive times updates located homes and leaves rejected ones alone", async () => {
  const buyer = await makeBuyer(db, (await makeAgent(db)).id, { anchors: [{ label: "Work", address: "Camden, NJ", lat: 39.94, lng: -75.11 }] });
  const placed = await makeMatch(db, buyer.id, { lat: 39.9, lng: -75.03 });
  await makeMatch(db, buyer.id, { address: "No coordinates St" });
  await makeMatch(db, buyer.id, { lat: 39.9, lng: -75.0, status: "dismissed" });

  const { matches, unplaced } = await refreshDriveTimes(buyer);
  assert.deepEqual(matches.map((m) => m.id), [placed.id]);
  assert.equal(unplaced, 1);
  const [toWork] = matches[0].distances;
  assert.equal(toWork.label, "Work");
  assert.ok(toWork.miles! > 4 && toWork.miles! < 6, `about 5 miles, got ${toWork.miles}`);
  assert.equal(toWork.minutes, null);
});
