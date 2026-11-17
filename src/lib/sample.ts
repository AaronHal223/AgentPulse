import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Buyer } from "./db/schema";

/**
 * A practice client with made-up homes, so a new agent can try saving, rejecting, sending,
 * the map and the tour planner before putting a real client in. It is never searched for,
 * re-checked or emailed about, and one tap removes it.
 */

const PROFILE = {
  name: "Alex & Sam Morgan (sample)",
  isSample: true,
  intent: "buy",
  budgetMin: 450_000,
  budgetMax: 550_000,
  bedsMin: 3,
  bathsMin: 2,
  propertyTypes: ["single-family"],
  areas: ["Maplewood (sample town)"],
  anchors: [{ label: "Work", address: "100 Main St, Maplewood", lat: 40.7312, lng: -74.2735 }],
  maxDriveMinutes: 20,
  mustHaves: ["Fenced yard", "Home office"],
  niceToHaves: ["Garage"],
  dealBreakers: ["Busy road"],
  timeline: "Move by summer",
  aiSummary: "A made-up couple with a dog who both work from home some days. They want a quiet street, a fenced yard and a real office, within 20 minutes of Alex's job.",
};

const home = (h: { slug: string; address: string; price: number; beds: number; baths: number; sqft: number; score: number; blurb: string; pros: string[]; cons: string[]; lat: number; lng: number; minutes: number; miles: number }) => ({
  url: `https://example.com/sample/${h.slug}`,
  source: "Sample listing",
  listingType: "sale",
  address: h.address,
  city: "Maplewood",
  state: "NJ",
  price: h.price,
  beds: h.beds,
  baths: h.baths,
  sqft: h.sqft,
  propertyType: "Single-family",
  summary: h.blurb,
  blurb: h.blurb,
  score: h.score,
  baseScore: h.score,
  reasoning: "Example reasoning for a sample home.",
  pros: h.pros,
  cons: h.cons,
  inArea: true,
  lat: h.lat,
  lng: h.lng,
  distances: [{ label: "Work", minutes: h.minutes, miles: h.miles }],
  // Marked as already emailed so sample homes never appear in a daily brief.
  briefedAt: new Date(),
});

const HOMES = [
  home({ slug: "14-elm", address: "14 Elm Court", price: 529_000, beds: 4, baths: 2.5, sqft: 2150, score: 9, blurb: "Fenced yard, a quiet cul-de-sac and a finished office over the garage. Everything on their list, under budget.", pros: ["Fenced yard", "Office over garage", "Cul-de-sac"], cons: ["Older kitchen"], lat: 40.7281, lng: -74.2702, minutes: 6, miles: 1.9 }),
  home({ slug: "88-ridge", address: "88 Ridge Road", price: 499_000, beds: 3, baths: 2, sqft: 1780, score: 7, blurb: "Good price and a bright spare room for an office, but the yard needs a fence.", pros: ["Under budget", "Spare room for office"], cons: ["No fence yet"], lat: 40.7405, lng: -74.2861, minutes: 12, miles: 4.3 }),
  home({ slug: "301-central", address: "301 Central Avenue", price: 545_000, beds: 4, baths: 3, sqft: 2400, score: 5, blurb: "Plenty of space and a garage, but it sits on a busy road, which is one of their deal-breakers.", pros: ["Large", "Garage"], cons: ["Busy road", "Top of budget"], lat: 40.7189, lng: -74.2954, minutes: 24, miles: 8.8 }),
];

async function findSample(agentId: string): Promise<Buyer | null> {
  const db = await getDb();
  const [sample] = await db.select().from(schema.buyers).where(and(eq(schema.buyers.agentId, agentId), eq(schema.buyers.isSample, true))).limit(1);
  return sample ?? null;
}

/** Creates the agent's sample client, or returns the one they already have. */
export async function createSampleClient(agentId: string): Promise<Buyer> {
  const existing = await findSample(agentId);
  if (existing) return existing;
  const db = await getDb();
  const [buyer] = await db.insert(schema.buyers).values({ ...PROFILE, agentId, lastSearchedAt: new Date() }).returning();
  await db.insert(schema.matches).values(HOMES.map((h) => ({ ...h, buyerId: buyer.id })));
  return buyer;
}

/** Removes the agent's sample client and everything attached to it. */
export async function removeSampleClient(agentId: string): Promise<void> {
  const db = await getDb();
  await db.delete(schema.buyers).where(and(eq(schema.buyers.agentId, agentId), eq(schema.buyers.isSample, true)));
}
