/**
 * Fills the database with a demo agent, clients and scored homes so you can click around
 * without any API keys. All data is made up.
 *   npm run seed:demo   → log in as demo@agentpulse.dev / demo1234
 */
import path from "node:path";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

async function connect() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (process.env.DATABASE_URL) {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    return { db, close: () => client.end() };
  }
  fs.mkdirSync(path.join(process.cwd(), ".data"), { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(path.join(process.cwd(), ".data", "pglite"));
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db, close: () => client.close() };
}

async function main() {
  const { db, close } = await connect();
  const email = "demo@agentpulse.dev";
  await db.delete(schema.agents).where(eq(schema.agents.email, email));
  const [agent] = await db
    .insert(schema.agents)
    .values({
      email,
      name: "Dana Rivera",
      brokerage: "Demo Realty",
      marketArea: "South Jersey",
      passwordHash: await bcrypt.hash("demo1234", 10),
      briefEmail: email,
    })
    .returning();

  const [patels] = await db
    .insert(schema.buyers)
    .values({
      agentId: agent.id,
      name: "Raj & Meera Patel",
      email: "patels@example.com",
      intent: "buy",
      budgetMin: 500000,
      budgetMax: 600000,
      bedsMin: 4,
      bathsMin: 2,
      propertyTypes: ["single-family"],
      areas: ["Haddonfield NJ", "Collingswood NJ"],
      anchors: [
        { label: "Work", address: "1 Cooper Plaza, Camden, NJ", lat: 39.9417, lng: -75.1145 },
        { label: "School", address: "Central School, Haddonfield, NJ", lat: 39.8977, lng: -75.0332 },
      ],
      maxDriveMinutes: 25,
      mustHaves: ["Fenced yard", "Walk to elementary school"],
      niceToHaves: ["Finished basement", "Home office"],
      dealBreakers: ["Busy road"],
      timeline: "Move by June",
      notes: "• Golden retriever named Biscuit\n• Raj works night shifts some weeks",
      aiSummary:
        "A family of four with a golden retriever moving closer to Raj's job at Cooper hospital. They want a walkable, school-centered neighborhood with a real yard and room for a home office, and they'll stretch a little for the right street but not for a busy road.",
      lastSearchedAt: new Date(Date.now() - 3 * 3600 * 1000),
    })
    .returning();

  const [jordan] = await db
    .insert(schema.buyers)
    .values({
      agentId: agent.id,
      name: "Jordan Lee",
      intent: "rent",
      budgetMax: 2200,
      bedsMin: 1,
      areas: ["Collingswood NJ", "Westmont NJ"],
      anchors: [{ label: "PATCO station", address: "Collingswood PATCO Station, NJ", lat: 39.9136, lng: -75.0647 }],
      maxDriveMinutes: 10,
      mustHaves: ["In-unit laundry", "Cats allowed"],
      aiSummary: "Young professional commuting to Philadelphia by PATCO; wants a walkable apartment with in-unit laundry that allows two cats.",
      lastSearchedAt: new Date(Date.now() - 5 * 3600 * 1000),
    })
    .returning();

  await db.insert(schema.messages).values([
    { buyerId: patels.id, role: "user", content: "Met the Patels today. 500-600k, 4 bed, Haddonfield or Collingswood. Raj works at Cooper in Camden — wants under 25 minutes. They have a big dog so they need a fenced yard." },
    { buyerId: patels.id, role: "assistant", content: "Got it — I've saved their budget, areas, the 25-minute limit to Cooper, and the fenced yard. Do the kids need to be near a particular school?" },
  ]);

  const now = Date.now();
  await db.insert(schema.matches).values([
    {
      buyerId: patels.id, url: "https://example.com/listing/412-maple", source: "Example Listings", listingType: "sale",
      address: "412 Maple Ave", city: "Haddonfield", state: "NJ", zip: "08033", price: 589000, beds: 4, baths: 2.5, sqft: 2240, propertyType: "Colonial",
      summary: "Renovated 1920s colonial on a tree-lined street with a fenced backyard, updated kitchen and a finished basement. Two blocks from Central School.",
      blurb: "A fenced yard for Biscuit, a walk to Central School, and a finished basement for Raj's office — this one checks every box under budget.",
      score: 9, reasoning: "In Haddonfield, under budget, meets both must-haves and most nice-to-haves; quick drive to Cooper.",
      pros: ["Fenced yard", "2 blocks to school", "Finished basement"], cons: ["One-car garage"], inArea: true,
      areaNote: "Heart of Haddonfield, walkable to downtown.", lat: 39.8985, lng: -75.0360,
      distances: [{ label: "Work", miles: 6.2, minutes: 14 }, { label: "School", miles: 0.3, minutes: 2 }],
      createdAt: new Date(now - 2 * 3600 * 1000),
    },
    {
      buyerId: patels.id, url: "https://example.com/listing/27-lees", source: "Example Listings", listingType: "sale",
      address: "27 Lees Ave", city: "Collingswood", state: "NJ", zip: "08108", price: 549000, beds: 4, baths: 2, sqft: 1980, propertyType: "Single-family",
      summary: "Classic Collingswood foursquare with a deep lot and new roof. Partially fenced yard; walk to Haddon Ave shops and PATCO.",
      blurb: "Big yard, walk-to-everything Collingswood, and room to spare in the budget for a fence upgrade.",
      score: 7, reasoning: "Great location and price, but yard is only partly fenced and no basement office space.",
      pros: ["Deep lot", "Walk to PATCO"], cons: ["Yard only partly fenced", "No finished basement"], inArea: true,
      areaNote: "Central Collingswood.", distances: [{ label: "Work", miles: 4.1, minutes: 11 }, { label: "School", miles: 2.7, minutes: 8 }],
      createdAt: new Date(now - 4 * 3600 * 1000),
    },
    {
      buyerId: patels.id, url: "https://example.com/listing/9-kings", source: "Example Listings", listingType: "sale",
      address: "9 Kings Hwy E", city: "Cherry Hill", state: "NJ", zip: "08034", price: 615000, beds: 4, baths: 2.5, sqft: 2500, propertyType: "Single-family",
      summary: "Spacious split-level on a main road with an open yard.",
      blurb: "Plenty of space, but it's on Kings Highway and outside your target towns.",
      score: 3, reasoning: "Over budget, on a busy road (deal-breaker), and outside the target areas.",
      pros: ["Large"], cons: ["Busy road", "Over budget"], inArea: false, areaNote: "Cherry Hill, not one of the target towns.",
      distances: [{ label: "Work", miles: 7.8, minutes: 17 }, { label: "School", miles: 2.2, minutes: 6 }],
      createdAt: new Date(now - 4 * 3600 * 1000),
    },
    {
      buyerId: jordan.id, url: "https://example.com/rent/collingswood-lofts-2b", source: "Example Rentals", listingType: "rent",
      address: "600 Haddon Ave #2B", city: "Collingswood", state: "NJ", zip: "08108", price: 1950, beds: 1, baths: 1, sqft: 780, propertyType: "Apartment",
      summary: "Second-floor loft apartment above shops with in-unit washer/dryer; pets allowed with deposit.",
      blurb: "In-unit laundry, cats welcome, and a 4-minute walk to PATCO — right in your budget.",
      score: 8, reasoning: "Meets both must-haves, under budget and very close to PATCO.",
      pros: ["In-unit laundry", "Cats OK"], cons: ["Street parking only"], inArea: true,
      distances: [{ label: "PATCO station", miles: 0.3, minutes: 2 }], createdAt: new Date(now - 1 * 3600 * 1000),
    },
  ]);

  await close();
  console.log("✓ Demo data ready. Log in as demo@agentpulse.dev / demo1234");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
