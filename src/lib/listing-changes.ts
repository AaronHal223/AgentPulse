import type { AlertData, Buyer, Match } from "./db/schema";
import { formatPrice } from "./format";

/**
 * Works out what changed on a home between two looks at its listing, and words the alert.
 * Plain comparisons on data we already have: no AI call, no database.
 */

export const LISTING_STATUSES = ["active", "pending", "sold", "off_market"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export type AlertKind = "price_drop" | "back_on_market" | "status_change" | "new_match";
export type AlertDraft = { kind: AlertKind; title: string; body: string; data: AlertData };

/** What a re-check found. "unknown" means the listing couldn't be confirmed either way. */
export type ListingCheck = { status: ListingStatus | "unknown"; price?: number | null };

type KnownHome = Pick<Match, "address" | "city" | "price" | "listingType" | "listingStatus">;

export const ALERT_MIN_SCORE = 8;

// Smaller moves are usually rounding or a fee shown differently on another site.
const MIN_DROP = 0.005;

const STATUS_WORDS: Record<ListingStatus, string> = {
  active: "back on the market",
  pending: "now pending",
  sold: "sold",
  off_market: "off the market",
};

export const statusLabel = (status: string) =>
  ({ active: "Active", pending: "Pending", sold: "Sold", off_market: "Off market" })[status] ?? status;

const isKnownStatus = (s: string): s is ListingStatus => (LISTING_STATUSES as readonly string[]).includes(s);

const homeName = (h: Pick<Match, "address" | "city">) => [h.address, h.city].filter(Boolean).join(", ") || "A saved home";

function statusChange(home: KnownHome, next: ListingStatus): AlertDraft | null {
  if (next === home.listingStatus) return null;
  const data = { oldStatus: home.listingStatus, newStatus: next };
  const was = isKnownStatus(home.listingStatus) ? statusLabel(home.listingStatus).toLowerCase() : home.listingStatus;
  if (next === "active") {
    return { kind: "back_on_market", title: `Back on the market: ${homeName(home)}`, body: `It was ${was}. It's available again.`, data };
  }
  return { kind: "status_change", title: `${homeName(home)} is ${STATUS_WORDS[next]}`, body: `It was ${was} when you saved it.`, data };
}

function priceDrop(home: KnownHome, price: number): AlertDraft | null {
  if (home.price == null || price <= 0 || price >= home.price * (1 - MIN_DROP)) return null;
  const percent = Math.round(((home.price - price) / home.price) * 1000) / 10;
  const money = (n: number) => formatPrice({ price: n, listingType: home.listingType });
  return {
    kind: "price_drop",
    title: `Price drop: ${homeName(home)}`,
    body: `${money(home.price)} → ${money(price)} (down ${percent}%).`,
    data: { oldPrice: home.price, newPrice: price },
  };
}

/** The alerts a re-check should raise for one home. Nothing when the check was inconclusive. */
export function detectChanges(home: KnownHome, check: ListingCheck): AlertDraft[] {
  if (check.status === "unknown") return [];
  const drafts: AlertDraft[] = [];
  const status = statusChange(home, check.status);
  if (status) drafts.push(status);
  // A lower price on a home that's gone is not news the agent can use.
  const stillBuyable = check.status === "active" || check.status === "pending";
  const drop = stillBuyable && check.price != null ? priceDrop(home, check.price) : null;
  if (drop) drafts.push(drop);
  return drafts;
}

/** The columns to store after a re-check. An inconclusive check only records that we looked. */
export function checkedValues(check: ListingCheck, now = new Date()): { lastCheckedAt: Date; listingStatus?: ListingStatus; price?: number } {
  if (check.status === "unknown") return { lastCheckedAt: now };
  const price = check.price != null && check.price > 0 ? { price: Math.round(check.price) } : {};
  return { lastCheckedAt: now, listingStatus: check.status, ...price };
}

/** An alert for a freshly found home that fits this client very well, or null if it doesn't. */
export function newMatchAlert(buyer: Pick<Buyer, "name">, m: Pick<Match, "address" | "city" | "price" | "listingType" | "score" | "inArea">): AlertDraft | null {
  if (m.score < ALERT_MIN_SCORE || !m.inArea) return null;
  return {
    kind: "new_match",
    title: `${m.score}/10 match for ${buyer.name}`,
    body: `${homeName(m)} · ${formatPrice(m)}`,
    data: { score: m.score },
  };
}
