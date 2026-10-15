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

/** Driving minutes + miles from one home to each anchor. */
export async function distancesFrom(home: LatLng | null, anchors: Anchor[]): Promise<Distance[]> {
  if (!anchors.length) return [];
  const located = anchors.filter((a): a is Anchor & LatLng => a.lat != null && a.lng != null);
  const result: Distance[] = anchors.map((a) => ({ label: a.label, miles: null, minutes: null }));
  if (!home || !located.length) return result;

  const k = key();
  if (k) {
    try {
      const res = await fetch(`${ORS}/v2/matrix/driving-car`, {
        method: "POST",
        headers: { Authorization: k, "Content-Type": "application/json" },
        body: JSON.stringify({
          locations: [[home.lng, home.lat], ...located.map((a) => [a.lng, a.lat])],
          sources: [0],
          destinations: located.map((_, i) => i + 1),
          metrics: ["distance", "duration"],
          units: "mi",
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`ORS matrix ${res.status}`);
      const data = (await res.json()) as { durations?: (number | null)[][]; distances?: (number | null)[][] };
      located.forEach((a, i) => {
        const idx = anchors.indexOf(a);
        const secs = data.durations?.[0]?.[i];
        const mi = data.distances?.[0]?.[i];
        result[idx] = {
          label: a.label,
          minutes: secs != null ? Math.round(secs / 60) : null,
          miles: mi != null ? Math.round(mi * 10) / 10 : null,
        };
      });
      return result;
    } catch (err) {
      console.warn("drive-time lookup failed, falling back to straight-line", err);
    }
  }
  located.forEach((a) => {
    const idx = anchors.indexOf(a);
    result[idx] = { label: a.label, minutes: null, miles: Math.round(haversineMiles(home, a) * 10) / 10 };
  });
  return result;
}
