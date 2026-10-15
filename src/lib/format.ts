import type { Match } from "./db/schema";

export function formatPrice(m: Pick<Match, "price" | "listingType">) {
  if (m.price == null) return "Price n/a";
  return `$${m.price.toLocaleString("en-US")}${m.listingType === "rent" ? "/mo" : ""}`;
}

export function factsLine(m: Pick<Match, "beds" | "baths" | "sqft" | "propertyType">) {
  return [
    m.beds != null ? `${m.beds} bd` : null,
    m.baths != null ? `${m.baths} ba` : null,
    m.sqft != null ? `${m.sqft.toLocaleString("en-US")} sqft` : null,
    m.propertyType,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function distanceText(d: { minutes: number | null; miles: number | null }) {
  const parts = [d.minutes != null ? `${d.minutes} min` : null, d.miles != null ? `${d.miles} mi` : null].filter(Boolean);
  return parts.join(" / ");
}

export function distanceLine(m: Pick<Match, "distances">) {
  return m.distances
    .filter((d) => d.minutes != null || d.miles != null)
    .map((d) => `${distanceText(d)} to ${d.label}`)
    .join(" · ");
}

export function timeAgo(date: Date | string | null | undefined) {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
