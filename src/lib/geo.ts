import "server-only";
import type { Anchor, Distance } from "./db/schema";

/**
 * Geocoding + drive time via OpenRouteService (free key: https://openrouteservice.org/dev/#/signup).
 * Without ORS_API_KEY, distances fall back to straight-line miles when coordinates are known.
 */
const ORS = "https://api.openrouteservice.org";
const key = () => process.env.ORS_API_KEY;

export type LatLng = { lat: number; lng: number };

const geocodeCache = new Map<string, LatLng | null>();

export async function geocode(address: string): Promise<LatLng | null> {
  const k = key();
  const q = address.trim();
  if (!k || !q) return null;
  if (geocodeCache.has(q)) return geocodeCache.get(q)!;
  try {
    const url = `${ORS}/geocode/search?api_key=${encodeURIComponent(k)}&size=1&boundary.country=US&text=${encodeURIComponent(q)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`ORS geocode ${res.status}`);
    const data = (await res.json()) as { features?: { geometry: { coordinates: [number, number] } }[] };
    const c = data.features?.[0]?.geometry.coordinates;
    const result = c ? { lng: c[0], lat: c[1] } : null;
    if (geocodeCache.size >= 500) geocodeCache.delete(geocodeCache.keys().next().value!); // keep memory bounded
    geocodeCache.set(q, result);
    return result;
  } catch (err) {
    console.warn("geocode failed", q, err);
    return null;
  }
}

export function haversineMiles(a: LatLng, b: LatLng) {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Makes sure each anchor has coordinates. Returns the (possibly) updated anchors and whether any changed. */
export async function geocodeAnchors(anchors: Anchor[]): Promise<{ anchors: Anchor[]; changed: boolean }> {
  let changed = false;
  const out: Anchor[] = [];
  for (const a of anchors) {
    if (a.lat != null && a.lng != null) {
      out.push(a);
      continue;
    }
    const p = await geocode(a.address);
    if (p) changed = true;
    out.push(p ? { ...a, ...p } : a);
  }
  return { anchors: out, changed };
}

type Matrix = { minutes: (number | null)[][]; miles: (number | null)[][] };

/**
 * Drive minutes and miles between points, from OpenRouteService's matrix. `sources` and
 * `destinations` are indexes into `points` (all of them when left out). Null when there's no
 * key or the lookup fails, so callers can fall back to straight-line distance.
 */
async function orsMatrix(points: LatLng[], sources?: number[], destinations?: number[]): Promise<Matrix | null> {
  const k = key();
  if (!k) return null;
  try {
    const res = await fetch(`${ORS}/v2/matrix/driving-car`, {
      method: "POST",
      headers: { Authorization: k, "Content-Type": "application/json" },
      body: JSON.stringify({
        locations: points.map((p) => [p.lng, p.lat]),
        ...(sources ? { sources } : {}),
        ...(destinations ? { destinations } : {}),
        metrics: ["distance", "duration"],
        units: "mi",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`ORS matrix ${res.status}`);
    const data = (await res.json()) as { durations?: (number | null)[][]; distances?: (number | null)[][] };
    const cells = (rows: (number | null)[][] | undefined, convert: (n: number) => number) =>
      (rows ?? []).map((row) => row.map((n) => (n == null ? null : convert(n))));
    return {
      minutes: cells(data.durations, (secs) => Math.round(secs / 60)),
      miles: cells(data.distances, (mi) => Math.round(mi * 10) / 10),
    };
  } catch (err) {
    console.warn("drive-time lookup failed, falling back to straight-line", err);
    return null;
  }
}

/** Driving minutes + miles from one home to each anchor. */
export async function distancesFrom(home: LatLng | null, anchors: Anchor[]): Promise<Distance[]> {
  if (!anchors.length) return [];
  const located = anchors.filter((a): a is Anchor & LatLng => a.lat != null && a.lng != null);
  const result: Distance[] = anchors.map((a) => ({ label: a.label, miles: null, minutes: null }));
  if (!home || !located.length) return result;

  const matrix = await orsMatrix([home, ...located], [0], located.map((_, i) => i + 1));
  located.forEach((a, i) => {
    const idx = anchors.indexOf(a);
    result[idx] = matrix
      ? { label: a.label, minutes: matrix.minutes[0]?.[i] ?? null, miles: matrix.miles[0]?.[i] ?? null }
      : { label: a.label, minutes: null, miles: Math.round(haversineMiles(home, a) * 10) / 10 };
  });
  return result;
}

// Without a routing answer: roads run about 30% longer than a straight line, at about 30 mph.
const ROAD_FACTOR = 1.3;
const MINUTES_PER_MILE = 2;

export type DriveMatrix = { minutes: number[][]; miles: number[][]; estimated: boolean };

/** Drive time between every pair of points, for planning a route. Estimated when routing is unavailable. */
export async function driveMatrix(points: LatLng[]): Promise<DriveMatrix> {
  const routed = await orsMatrix(points);
  let estimated = false;
  const minutes: number[][] = [];
  const miles: number[][] = [];
  points.forEach((from, i) => {
    minutes.push([]);
    miles.push([]);
    points.forEach((to, j) => {
      const routedMinutes = routed?.minutes[i]?.[j];
      const routedMiles = routed?.miles[i]?.[j];
      if (routedMinutes != null && routedMiles != null) {
        minutes[i].push(routedMinutes);
        miles[i].push(routedMiles);
        return;
      }
      if (i !== j) estimated = true;
      const guess = haversineMiles(from, to) * ROAD_FACTOR;
      miles[i].push(Math.round(guess * 10) / 10);
      minutes[i].push(Math.round(guess * MINUTES_PER_MILE));
    });
  });
  return { minutes, miles, estimated };
}
