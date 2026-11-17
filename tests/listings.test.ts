import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { schema, type DB } from "../src/lib/db";
import type { Buyer } from "../src/lib/db/schema";
import { searchHomesForBuyer } from "../src/lib/ai/search";
import { addressLink, parseArea, queryFor, toCandidate } from "../src/lib/listings/rentcast";
import { takeFromAllowance, usedThisMonth } from "../src/lib/usage";
import { stubGemini } from "./helpers/ai";
import { makeAgent, makeBuyer, makeMatch, useTestDb } from "./helpers/db";

test("target areas become RentCast places; vague ones are skipped", () => {
  assert.deepEqual(parseArea("Haddonfield NJ"), { city: "Haddonfield", state: "NJ" });
  assert.deepEqual(parseArea("Cherry Hill, nj"), { city: "Cherry Hill", state: "NJ" });
  assert.deepEqual(parseArea("Haddonfield, NJ 08033"), { zipCode: "08033" });
  assert.equal(parseArea("near the river"), null);
  assert.equal(parseArea("Somewhere XX"), null);
});

test("the query follows the profile, with a little room above the budget", () => {
  const buyer = { budgetMin: 500_000, budgetMax: 600_000, bedsMin: 3, bathsMin: 2, sqftMin: null, propertyTypes: ["single-family", "townhouse"] } as unknown as Buyer;
  const q = queryFor(buyer, { city: "Haddonfield", state: "NJ" });
  assert.equal(q.get("price"), "450000:630000");
  assert.equal(q.get("bedrooms"), "3:*");
  assert.equal(q.get("bathrooms"), "2:*");
  assert.equal(q.get("propertyType"), "Single Family|Townhouse");
  assert.equal(q.get("status"), "Active");
  assert.equal(q.has("squareFootage"), false);
  assert.equal(queryFor({ ...buyer, propertyTypes: [], budgetMin: null } as Buyer, { zipCode: "08033" }).get("price"), "*:630000");
});

test("a feed listing keeps its facts and links to the address", () => {
  const c = toCandidate({ id: "abc", formattedAddress: "12 Oak St, Haddonfield, NJ 08033", addressLine1: "12 Oak St", city: "Haddonfield", state: "NJ", price: 550000, bedrooms: 4, latitude: 39.9, longitude: -75.03, mlsName: "BrightMLS" }, "sale")!;
  assert.equal(c.url, "https://www.zillow.com/homes/12-Oak-St-Haddonfield-NJ-08033_rb/");
  assert.equal(c.source, "BrightMLS (via RentCast)");
  assert.deepEqual([c.address, c.price, c.beds, c.lat], ["12 Oak St", 550000, 4, 39.9]);
  assert.equal(toCandidate({ formattedAddress: "no id" }, "sale"), null);
  assert.match(addressLink("1 A St, B, NJ"), /^https:\/\/www\.zillow\.com\/homes\//);
});

let db: DB;
let ai: Awaited<ReturnType<typeof stubGemini>>;
const realFetch = globalThis.fetch;
let feedCalls: string[] = [];
let feedRows: unknown[] = [];

before(async () => {
  db = await useTestDb();
  ai = await stubGemini(() => ({}));
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url instanceof Request ? url.url : url);
    if (!href.startsWith("https://api.rentcast.io/")) return realFetch(url, init);
    feedCalls.push(href);
    return new Response(JSON.stringify(feedRows), { status: 200 });
  }) as typeof fetch;
});
after(() => {
  ai.close();
  globalThis.fetch = realFetch;
  delete process.env.RENTCAST_API_KEY;
});

test("the monthly allowance is counted per service and never goes over", async () => {
  const may = new Date("2026-05-10T12:00:00Z");
  const results = await Promise.all(Array.from({ length: 5 }, () => takeFromAllowance("test-service", 3, may)));
  assert.equal(results.filter(Boolean).length, 3);
  assert.equal(await usedThisMonth("test-service", may), 3);
  assert.equal(await takeFromAllowance("test-service", 3, new Date("2026-06-01T00:00:00Z")), true, "a new month starts fresh");
  assert.equal(await takeFromAllowance("other-service", 0, may), false);
});

const row = (id: string, address: string, price: number) => ({ id, formattedAddress: `${address}, Haddonfield, NJ 08033`, addressLine1: address, city: "Haddonfield", state: "NJ", zipCode: "08033", price, bedrooms: 4, bathrooms: 2, latitude: 39.9, longitude: -75.03, mlsName: "BrightMLS" });

test("with a feed key, real listings are judged by the AI without changing their facts", async () => {
  process.env.RENTCAST_API_KEY = "test-key";
  process.env.RENTCAST_MONTHLY_LIMIT = "40";
  feedCalls = [];
  const buyer = await makeBuyer(db, (await makeAgent(db)).id, { areas: ["Haddonfield NJ", "Collingswood NJ", "Cherry Hill NJ"], budgetMax: 600_000 });
  await makeMatch(db, buyer.id, { address: "1 Already Found St", url: "https://example.com/old" });
  feedRows = [row("r1", "12 Oak St", 550000), row("r2", "1 Already Found St", 500000), row("r3", "9 Busy Rd", 590000)];
  ai.setReply((prompt) => {
    assert.doesNotMatch(prompt, /Already Found/, "homes already on the list aren't judged again");
    assert.doesNotMatch(prompt, /google_search|web_fetch/i, "no web browsing when the feed has listings");
    return {
      homes: [
        // The AI tries to change the price; the feed's price wins.
        { ref: "r1", price: 1, summary: "4 bed colonial.", blurb: "Great yard. Perfect for a young family.", score: 9, reasoning: "Fits.", inArea: true },
        { ref: "r3", summary: "On a busy road.", blurb: "Big lot.", score: 4, reasoning: "Busy road.", inArea: true },
        { ref: "made-up", summary: "x", blurb: "x", score: 10, reasoning: "x", inArea: true },
      ],
    };
  });

  const { matches, notes } = await searchHomesForBuyer(await makeAgent(db), buyer);
  assert.equal(feedCalls.length, 2, "only the first two areas are asked for, to save the allowance");
  assert.match(feedCalls[0], /listings\/sale\?.*city=Haddonfield/);
  assert.deepEqual(matches.map((m) => [m.address, m.price]).sort(), [["12 Oak St", 550000], ["9 Busy Rd", 590000]]);
  const oak = matches.find((m) => m.address === "12 Oak St")!;
  assert.equal(oak.source, "BrightMLS (via RentCast)");
  assert.equal(oak.blurb, "Great yard.", "steering wording is dropped from text meant for the client");
  assert.match(notes ?? "", /MLS feed/);
});

test("when the month's feed allowance is used up, the search falls back to the web", async () => {
  process.env.RENTCAST_API_KEY = "test-key";
  process.env.RENTCAST_MONTHLY_LIMIT = "0";
  feedCalls = [];
  const buyer = await makeBuyer(db, (await makeAgent(db)).id, { areas: ["Haddonfield NJ"] });
  ai.setReply(() => ({ listings: [], notes: "Thin inventory." }));
  const { matches, notes } = await searchHomesForBuyer(await makeAgent(db), buyer);
  assert.equal(feedCalls.length, 0);
  assert.equal(matches.length, 0);
  assert.match(notes ?? "", /used up/);
  const [saved] = await db.select().from(schema.buyers).where(eq(schema.buyers.id, buyer.id));
  assert.ok(saved.lastSearchedAt);
});
