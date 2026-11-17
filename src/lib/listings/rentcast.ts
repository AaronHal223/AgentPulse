import "server-only";
import type { Buyer } from "../db/schema";
import { takeFromAllowance } from "../usage";

/**
 * Real, structured listings from RentCast (sale and long-term rental), which gathers them from
 * MLS feeds. Free for 50 requests a month; past that RentCast bills per request and can't be
 * told to stop, so the app keeps its own count and stops at RENTCAST_MONTHLY_LIMIT.
 */

const API = "https://api.rentcast.io/v1";
const PER_AREA = 20;
const AREAS_PER_SEARCH = 2;
export const RENTCAST = "rentcast";

export const rentcastConfigured = () => Boolean(process.env.RENTCAST_API_KEY?.trim());
export const rentcastMonthlyLimit = () => Number(process.env.RENTCAST_MONTHLY_LIMIT || 40);

/** A listing with the facts filled in by RentCast, ready for the AI to judge. */
export type Candidate = {
  ref: string;
  url: string;
  source: string;
  listingType: "sale" | "rent";
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  propertyType?: string;
  yearBuilt?: number;
  daysOnMarket?: number;
  lat?: number;
  lng?: number;
};

export type Place = { city: string; state: string } | { zipCode: string };

const STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));

/** "Haddonfield NJ", "Haddonfield, NJ 08033" or "08033" → something RentCast can search. */
export function parseArea(area: string): Place | null {
  const zip = /\b(\d{5})\b/.exec(area);
  if (zip) return { zipCode: zip[1] };
  const m = /^\s*(.+?)[,\s]+([A-Za-z]{2})\s*$/.exec(area);
  if (!m || !STATES.has(m[2].toUpperCase())) return null;
  return { city: m[1].trim().replace(/\s+/g, " "), state: m[2].toUpperCase() };
}

const TYPES: [RegExp, string][] = [
  [/single|house|detached/i, "Single Family"],
  [/condo/i, "Condo"],
  [/town/i, "Townhouse"],
  [/multi|duplex|triplex/i, "Multi-Family"],
  [/apart/i, "Apartment"],
  [/manufactured|mobile/i, "Manufactured"],
];

const range = (min?: number | null, max?: number | null) => (min || max ? `${min ?? "*"}:${max ?? "*"}` : null);

/** The query for one area, from the client's profile. Price allows a little stretch above the max. */
export function queryFor(buyer: Buyer, place: Place): URLSearchParams {
  const q = new URLSearchParams({ status: "Active", limit: String(PER_AREA) });
  for (const [key, value] of Object.entries(place)) q.set(key, value);
  const stretchMax = buyer.budgetMax ? Math.round(buyer.budgetMax * 1.05) : null;
  const filters: Record<string, string | null> = {
    price: range(buyer.budgetMin ? Math.round(buyer.budgetMin * 0.9) : null, stretchMax),
    bedrooms: range(buyer.bedsMin, null),
    bathrooms: range(buyer.bathsMin, null),
    squareFootage: range(buyer.sqftMin, null),
    propertyType: [...new Set(buyer.propertyTypes.flatMap((t) => TYPES.filter(([re]) => re.test(t)).map(([, v]) => v)))].join("|") || null,
  };
  for (const [key, value] of Object.entries(filters)) if (value) q.set(key, value);
  return q;
}

type RentcastListing = {
  id?: string;
  formattedAddress?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  yearBuilt?: number;
  price?: number;
  daysOnMarket?: number;
  mlsName?: string;
};

/** A link anyone can open: the address on Zillow, since RentCast doesn't give a listing page. */
export const addressLink = (address: string) => `https://www.zillow.com/homes/${encodeURIComponent(address.replace(/,/g, " ").replace(/\s+/g, "-"))}_rb/`;

export function toCandidate(r: RentcastListing, listingType: "sale" | "rent"): Candidate | null {
  const address = r.formattedAddress ?? [r.addressLine1, r.city, r.state, r.zipCode].filter(Boolean).join(", ");
  if (!address || !r.id) return null;
  return {
    ref: r.id,
    url: addressLink(address),
    source: r.mlsName ? `${r.mlsName} (via RentCast)` : "RentCast",
    listingType,
    address: r.addressLine1 ?? address,
    city: r.city,
    state: r.state,
    zip: r.zipCode,
    price: r.price,
    beds: r.bedrooms,
    baths: r.bathrooms,
    sqft: r.squareFootage,
    propertyType: r.propertyType,
    yearBuilt: r.yearBuilt,
    daysOnMarket: r.daysOnMarket,
    lat: r.latitude,
    lng: r.longitude,
  };
}

async function fetchArea(buyer: Buyer, place: Place): Promise<Candidate[]> {
  const listingType = buyer.intent === "rent" ? "rent" : "sale";
  const path = listingType === "rent" ? "/listings/rental/long-term" : "/listings/sale";
  const res = await fetch(`${API}${path}?${queryFor(buyer, place)}`, {
    headers: { "X-Api-Key": process.env.RENTCAST_API_KEY!.trim(), accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404) return []; // RentCast's answer for "no listings match"
  if (!res.ok) throw new Error(`RentCast answered ${res.status}`);
  const rows = (await res.json()) as RentcastListing[];
  return (Array.isArray(rows) ? rows : []).flatMap((r) => toCandidate(r, listingType) ?? []);
}

/**
 * Live listings in the client's first target areas. Empty when RentCast isn't set up, the
 * month's allowance is used, or nothing matches, so the caller can fall back to a web search.
 */
export async function rentcastListings(buyer: Buyer): Promise<{ candidates: Candidate[]; note?: string }> {
  if (!rentcastConfigured()) return { candidates: [] };
  const places = buyer.areas.map(parseArea).filter((p): p is Place => p !== null).slice(0, AREAS_PER_SEARCH);
  if (!places.length) return { candidates: [], note: "Listings feed skipped: add target areas as “Town ST” or a ZIP code." };

  const candidates: Candidate[] = [];
  for (const place of places) {
    if (!(await takeFromAllowance(RENTCAST, rentcastMonthlyLimit()))) {
      return { candidates, note: "This month's free listings-feed requests are used up, so the rest came from a web search." };
    }
    try {
      candidates.push(...(await fetchArea(buyer, place)));
    } catch (err) {
      console.warn("RentCast lookup failed", err instanceof Error ? err.message : err);
    }
  }
  const unique = [...new Map(candidates.map((c) => [c.ref, c])).values()];
  return { candidates: unique };
}
