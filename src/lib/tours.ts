import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Buyer, Match } from "./db/schema";
import { HttpError } from "./errors";
import { driveMatrix, geocode, type LatLng } from "./geo";
import { bestOrder, routeMinutes, schedule, TOUR_MAX_STOPS, TOUR_MIN_STOPS } from "./tour";

export type TourStop = {
  matchId: string;
  address: string;
  arrive: string;
  leave: string;
  driveMinutes: number;
  driveMiles: number;
};

export type Tour = { stops: TourStop[]; totalDriveMinutes: number; estimated: boolean; mapsUrl: string };

const addressOf = (m: Match) => [m.address, m.city, m.state, m.zip].filter(Boolean).join(", ");

async function positionOf(home: Match): Promise<LatLng | null> {
  if (home.lat != null && home.lng != null) return { lat: home.lat, lng: home.lng };
  return addressOf(home) ? geocode(addressOf(home)) : null;
}

/** A Google Maps directions link for the whole route. Just a link: no key, no cost. */
function mapsUrl(points: LatLng[]): string {
  const at = (p: LatLng) => `${p.lat},${p.lng}`;
  const params = new URLSearchParams({ api: "1", travelmode: "driving", origin: at(points[0]), destination: at(points[points.length - 1]) });
  if (points.length > 2) params.set("waypoints", points.slice(1, -1).map(at).join("|"));
  return `https://www.google.com/maps/dir/?${params}`;
}

/**
 * Plans a showing tour through 2–6 of one client's homes: best driving order, then a time
 * slot for each. Only homes that belong to this client are ever used.
 */
export async function planTour(buyer: Buyer, matchIds: string[], opts: { startMinutes: number; visitMinutes: number }): Promise<Tour> {
  const ids = [...new Set(matchIds)];
  if (ids.length < TOUR_MIN_STOPS || ids.length > TOUR_MAX_STOPS) {
    throw new HttpError(400, `Pick ${TOUR_MIN_STOPS} to ${TOUR_MAX_STOPS} homes for a tour.`);
  }
  const db = await getDb();
  const found = await db
    .select()
    .from(schema.matches)
    .where(and(eq(schema.matches.buyerId, buyer.id), inArray(schema.matches.id, ids)));
  if (found.length !== ids.length) throw new HttpError(404, "One of those homes isn't on this client's list any more.");
  // Keep the agent's picking order; it breaks ties between equally short routes.
  const homes = ids.map((id) => found.find((m) => m.id === id)!);

  const positions = await Promise.all(homes.map(positionOf));
  const lost = homes.filter((_, i) => !positions[i]);
  if (lost.length) {
    const names = lost.map((m) => m.address || "a home without an address").join(", ");
    throw new HttpError(422, `Couldn't find ${names} on the map, so it can't be routed. Leave it out and try again.`);
  }
  const points = positions as LatLng[];

  const matrix = await driveMatrix(points);
  const order = bestOrder(matrix.minutes);
  const slots = schedule(order, matrix.minutes, opts);
  const stops = slots.map((slot, i) => ({
    matchId: homes[slot.stop].id,
    address: addressOf(homes[slot.stop]) || "Address not listed",
    arrive: slot.arrive,
    leave: slot.leave,
    driveMinutes: slot.driveMinutes,
    driveMiles: i === 0 ? 0 : matrix.miles[order[i - 1]][slot.stop],
  }));
  return {
    stops,
    totalDriveMinutes: routeMinutes(order, matrix.minutes),
    estimated: matrix.estimated,
    mapsUrl: mapsUrl(order.map((i) => points[i])),
  };
}
