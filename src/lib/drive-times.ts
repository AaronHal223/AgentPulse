import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Buyer, Match } from "./db/schema";
import { distancesFrom, geocode, geocodeAnchors, type LatLng } from "./geo";

// Each home costs up to two lookups on the free drive-time service, so one request stays modest.
const HOMES_PER_REFRESH = 40;

export const driveTimesConfigured = () => Boolean(process.env.ORS_API_KEY);

const fullAddress = (m: Match) => [m.address, m.city, m.state, m.zip].filter(Boolean).join(", ");

async function locate(home: Match): Promise<LatLng | null> {
  if (home.lat != null && home.lng != null) return { lat: home.lat, lng: home.lng };
  const address = fullAddress(home);
  return address ? geocode(address) : null;
}

/**
 * Puts a client's homes on the map and brings their drive times up to date, e.g. after the
 * agent changes the client's important places. Rejected homes are left alone.
 */
export async function refreshDriveTimes(buyer: Buyer): Promise<{ matches: Match[]; unplaced: number }> {
  const db = await getDb();
  const { anchors, changed } = await geocodeAnchors(buyer.anchors);
  if (changed) await db.update(schema.buyers).set({ anchors }).where(eq(schema.buyers.id, buyer.id));

  const homes = await db
    .select()
    .from(schema.matches)
    .where(and(eq(schema.matches.buyerId, buyer.id), ne(schema.matches.status, "dismissed")))
    .limit(HOMES_PER_REFRESH);

  const matches: Match[] = [];
  let unplaced = 0;
  for (const home of homes) {
    const position = await locate(home);
    if (!position) {
      unplaced++;
      continue;
    }
    const distances = await distancesFrom(position, anchors);
    const [updated] = await db
      .update(schema.matches)
      .set({ lat: position.lat, lng: position.lng, distances })
      .where(eq(schema.matches.id, home.id))
      .returning();
    matches.push(updated);
  }
  return { matches, unplaced };
}
