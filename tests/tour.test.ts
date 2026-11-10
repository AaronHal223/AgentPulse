import test, { before } from "node:test";
import assert from "node:assert/strict";
import type { DB } from "../src/lib/db";
import { bestOrder, parseClock, routeMinutes, schedule } from "../src/lib/tour";
import { planTour } from "../src/lib/tours";
import { makeAgent, makeBuyer, makeMatch, useTestDb } from "./helpers/db";

// Four homes along a road, 10 minutes apart: A — B — C — D
const line = [
  [0, 10, 20, 30],
  [10, 0, 10, 20],
  [20, 10, 0, 10],
  [30, 20, 10, 0],
];

test("the best order is the one with the least driving", () => {
  // Picked as B, D, A, C: the planner should walk the road end to end instead.
  const picked = [1, 3, 0, 2];
  const minutes = picked.map((i) => picked.map((j) => line[i][j]));
  const order = bestOrder(minutes);
  assert.equal(routeMinutes(order, minutes), 30);
  // Either end of the road is a fine place to start.
  const road = order.map((i) => picked[i]).join("");
  assert.ok(road === "0123" || road === "3210", road);
});

test("ties keep the order the agent picked, and two homes are left as they are", () => {
  assert.deepEqual(bestOrder([[0, 7], [7, 0]]), [0, 1]);
  const equal = [[0, 5, 5], [5, 0, 5], [5, 5, 0]];
  assert.deepEqual(bestOrder(equal), [0, 1, 2]);
});

test("one-way streets count: the table doesn't have to be symmetric", () => {
  const minutes = [[0, 30, 5], [5, 0, 30], [30, 5, 0]];
  assert.deepEqual(bestOrder(minutes), [0, 2, 1]);
});

test("time slots add the visit and the drive, rounded up to five minutes", () => {
  const minutes = [[0, 12, 0], [12, 0, 23], [0, 23, 0]];
  const slots = schedule([0, 1, 2], minutes, { startMinutes: parseClock("10:00")!, visitMinutes: 30 });
  assert.deepEqual(
    slots.map((s) => [s.arrive, s.leave, s.driveMinutes]),
    [
      ["10:00", "10:30", 0],
      ["10:45", "11:15", 12], // 10:42 → 10:45
      ["11:40", "12:10", 23], // 11:38 → 11:40
    ],
  );
});

test("only real clock times are accepted", () => {
  assert.equal(parseClock("09:05"), 545);
  assert.equal(parseClock("9:05"), 545);
  for (const bad of ["24:00", "10:60", "soon", "", "10"]) assert.equal(parseClock(bad), null, bad);
});

let db: DB;
before(async () => {
  db = await useTestDb();
  delete process.env.ORS_API_KEY; // no network in tests: drive times are estimated
});

const opts = { startMinutes: 600, visitMinutes: 30 };

test("a tour is planned through the client's own homes, shortest route first", async () => {
  const buyer = await makeBuyer(db, (await makeAgent(db)).id);
  const west = await makeMatch(db, buyer.id, { address: "1 West St", lat: 39.9, lng: -75.3 });
  const east = await makeMatch(db, buyer.id, { address: "3 East St", lat: 39.9, lng: -75.0 });
  const middle = await makeMatch(db, buyer.id, { address: "2 Middle St", lat: 39.9, lng: -75.15 });

  const tour = await planTour(buyer, [west.id, east.id, middle.id], opts);
  assert.deepEqual(tour.stops.map((s) => s.address), ["1 West St", "2 Middle St", "3 East St"]);
  assert.equal(tour.stops[0].arrive, "10:00");
  assert.ok(tour.stops[1].arrive > tour.stops[0].leave);
  assert.equal(tour.estimated, true);
  assert.match(tour.mapsUrl, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1/);
  assert.equal(tour.totalDriveMinutes, tour.stops[1].driveMinutes + tour.stops[2].driveMinutes);
});

test("a tour never includes another client's home", async () => {
  const mine = await makeBuyer(db, (await makeAgent(db)).id);
  const theirs = await makeBuyer(db, (await makeAgent(db)).id);
  const a = await makeMatch(db, mine.id, { lat: 39.9, lng: -75.1 });
  const b = await makeMatch(db, theirs.id, { lat: 39.9, lng: -75.2 });
  await assert.rejects(() => planTour(mine, [a.id, b.id], opts), /isn't on this client's list/);
});

test("too few, too many, or unlocatable homes get a clear message", async () => {
  const buyer = await makeBuyer(db, (await makeAgent(db)).id);
  const placed = await makeMatch(db, buyer.id, { lat: 39.9, lng: -75.1 });
  const lost = await makeMatch(db, buyer.id, { address: "99 Nowhere Ln" });
  await assert.rejects(() => planTour(buyer, [placed.id], opts), /Pick 2 to 6 homes/);
  await assert.rejects(() => planTour(buyer, [placed.id, placed.id], opts), /Pick 2 to 6 homes/);
  await assert.rejects(() => planTour(buyer, Array.from({ length: 7 }, (_, i) => `id-${i}`), opts), /Pick 2 to 6 homes/);
  await assert.rejects(() => planTour(buyer, [placed.id, lost.id], opts), /Couldn't find 99 Nowhere Ln/);
});
