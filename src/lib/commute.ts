import type { Anchor, Distance, Match } from "./db/schema";

/**
 * Commute checks for the map and list: drive time from a home to the one or two places that
 * matter most to a client. Works on the drive times already stored with each home.
 */

export const MAX_COMMUTE_PLACES = 2;

export type CommuteFit = "within" | "over" | "unknown";

type Home = Pick<Match, "distances">;

/** The places compared by default: the client's first two important places. */
export const defaultCommutePlaces = (anchors: Anchor[]) => anchors.slice(0, MAX_COMMUTE_PLACES).map((a) => a.label);

/** Adds or removes a place, keeping at most two (the oldest pick makes room for a new one). */
export function togglePlace(picked: string[], label: string): string[] {
  if (picked.includes(label)) return picked.filter((p) => p !== label);
  return [...picked, label].slice(-MAX_COMMUTE_PLACES);
}

/** This home's drive to each chosen place, in the order chosen. */
export function commutesTo(home: Home, places: string[]): Distance[] {
  return places.flatMap((label) => home.distances.find((d) => d.label === label) ?? []);
}

/** The longest drive to any chosen place, or null when no drive time is known. */
export function longestCommute(home: Home, places: string[]): number | null {
  const minutes = commutesTo(home, places).flatMap((d) => (d.minutes == null ? [] : [d.minutes]));
  return minutes.length ? Math.max(...minutes) : null;
}

/** Whether every chosen place is within the limit. Homes without drive times are "unknown", never hidden. */
export function commuteFit(home: Home, places: string[], maxMinutes: number | null): CommuteFit {
  const longest = longestCommute(home, places);
  if (longest == null || !maxMinutes) return "unknown";
  return longest <= maxMinutes ? "within" : "over";
}
