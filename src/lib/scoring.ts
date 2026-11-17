import type { Buyer, Distance, Match } from "./db/schema";

/**
 * How feedback changes a home's 1–10 score, and how a score is explained.
 * Everything here is plain arithmetic on data we already have: no AI call, no database.
 */

export const REJECT_REASONS = ["price", "location", "size", "condition", "layout", "other"] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export type Verdict = "saved" | "rejected" | "liked" | "disliked";

export type HomeFacts = Pick<Match, "id" | "address" | "city" | "zip" | "price" | "sqft" | "beds" | "baths">;

export type FeedbackEntry = {
  source: "agent" | "client";
  verdict: Verdict;
  reasons: string[];
  note: string | null;
  home: HomeFacts;
};

export type Adjustment = { delta: number; notes: string[] };

/** A home whose score moved after new feedback. */
export type Rescored = { id: string; score: number };

const MAX_BOOST = 2;
const MAX_PENALTY = -3;

const isPositive = (e: FeedbackEntry) => e.verdict === "saved" || e.verdict === "liked";
const rejectedFor = (entries: FeedbackEntry[], reason: RejectReason) =>
  entries.filter((e) => e.verdict === "rejected" && e.reasons.includes(reason));

/** Town-level key so "Haddonfield" and "haddonfield " count as the same place. */
const placeOf = (h: Pick<HomeFacts, "city" | "zip">) => (h.city || h.zip || "").trim().toLowerCase();

const numbers = (xs: (number | null)[]) => xs.filter((x): x is number => x != null);
const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const dollars = (n: number) => `$${n.toLocaleString("en-US")}`;

function priceAdjustment(home: HomeFacts, entries: FeedbackEntry[]): Adjustment {
  if (home.price == null) return { delta: 0, notes: [] };
  const tooExpensive = numbers(rejectedFor(entries, "price").map((e) => e.home.price));
  if (tooExpensive.length && home.price >= Math.min(...tooExpensive)) {
    const delta = tooExpensive.length > 1 ? -2 : -1;
    return { delta, notes: [`Priced at or above homes they turned down for price (from ${dollars(Math.min(...tooExpensive))})`] };
  }
  const liked = numbers(entries.filter(isPositive).map((e) => e.home.price));
  if (liked.length >= 2 && home.price >= Math.min(...liked) && home.price <= Math.max(...liked)) {
    return { delta: 1, notes: ["Priced like the homes they've saved"] };
  }
  return { delta: 0, notes: [] };
}

function locationAdjustment(home: HomeFacts, entries: FeedbackEntry[]): Adjustment {
  const place = placeOf(home);
  if (!place) return { delta: 0, notes: [] };
  const here = (list: FeedbackEntry[]) => list.filter((e) => placeOf(e.home) === place).length;
  const turnedDown = here(rejectedFor(entries, "location"));
  const liked = here(entries.filter(isPositive));
  const town = home.city || home.zip;
  if (turnedDown > liked) {
    return { delta: turnedDown - liked > 1 ? -2 : -1, notes: [`They've turned down ${town} for location before`] };
  }
  if (!turnedDown && liked >= 2) return { delta: 1, notes: [`They've saved ${liked} homes in ${town}`] };
  return { delta: 0, notes: [] };
}

/**
 * "Size" can mean too small or too big. We read the direction from the homes they liked,
 * and assume too small (by far the usual complaint) when there's nothing to compare with.
 */
function sizeAdjustment(home: HomeFacts, entries: FeedbackEntry[]): Adjustment {
  if (home.sqft == null) return { delta: 0, notes: [] };
  const rejected = numbers(rejectedFor(entries, "size").map((e) => e.home.sqft));
  if (!rejected.length) return { delta: 0, notes: [] };
  const liked = numbers(entries.filter(isPositive).map((e) => e.home.sqft));
  const tooBig = liked.length > 0 && average(rejected) > average(liked);
  const similar = tooBig ? home.sqft >= Math.min(...rejected) : home.sqft <= Math.max(...rejected);
  if (!similar) return { delta: 0, notes: [] };
  return { delta: -1, notes: [`About the size of homes they found too ${tooBig ? "big" : "small"}`] };
}

/** The client's own reaction to this exact home, from their private page. */
function clientAdjustment(home: HomeFacts, entries: FeedbackEntry[]): Adjustment {
  const own = entries.find((e) => e.source === "client" && e.home.id === home.id);
  if (own?.verdict === "liked") return { delta: 1, notes: ["Your client liked this home"] };
  if (own?.verdict === "disliked") return { delta: -2, notes: ["Your client passed on this home"] };
  return { delta: 0, notes: [] };
}

/**
 * Points to add to (or take off) a home's score because of feedback. Patterns are learned
 * from other homes only, so the agent saving a home can't make it vote for itself; the
 * client's reaction to this very home counts directly.
 */
export function feedbackAdjustment(home: HomeFacts, allEntries: FeedbackEntry[]): Adjustment {
  const entries = allEntries.filter((e) => e.home.id !== home.id);
  const parts = [
    priceAdjustment(home, entries),
    locationAdjustment(home, entries),
    sizeAdjustment(home, entries),
    clientAdjustment(home, allEntries),
  ];
  const total = parts.reduce((n, p) => n + p.delta, 0);
  return {
    delta: Math.max(MAX_PENALTY, Math.min(MAX_BOOST, total)),
    notes: parts.flatMap((p) => p.notes),
  };
}

export const clampScore = (n: number) => Math.max(1, Math.min(10, Math.round(n)));

/**
 * Holds a score accountable to the client's drive-time limit: up to 3 points off per place
 * that's too far, one for every 15 minutes over.
 */
export function drivePenalty(distances: Distance[], maxDriveMinutes: number | null): { points: number; cons: string[] } {
  let points = 0;
  const cons: string[] = [];
  if (!maxDriveMinutes) return { points, cons };
  for (const d of distances) {
    if (d.minutes == null || d.minutes <= maxDriveMinutes) continue;
    points += Math.min(3, Math.ceil((d.minutes - maxDriveMinutes) / 15));
    cons.push(`${d.minutes} min drive to ${d.label} (limit ${maxDriveMinutes})`);
  }
  return { points, cons };
}

/** The score before feedback. Homes saved before feedback existed only have `score`. */
export const baseScoreOf = (m: Pick<Match, "score" | "baseScore">) => m.baseScore ?? m.score;

export type Factor = {
  key: "price" | "commute" | "size" | "rooms" | "area" | "wishes" | "tradeoffs" | "feedback";
  label: string;
  effect: "helped" | "hurt" | "neutral";
  detail: string;
};

function priceFactor(buyer: Buyer, m: Match): Factor {
  const base = { key: "price" as const, label: "Price" };
  if (m.price == null) return { ...base, effect: "neutral", detail: "The listing doesn't show a price." };
  if (!buyer.budgetMax) return { ...base, effect: "neutral", detail: `${dollars(m.price)}. No budget is set for this client.` };
  if (m.price <= buyer.budgetMax) return { ...base, effect: "helped", detail: `${dollars(m.price)} is within their ${dollars(buyer.budgetMax)} budget.` };
  const over = Math.round(((m.price - buyer.budgetMax) / buyer.budgetMax) * 100);
  return { ...base, effect: "hurt", detail: `${dollars(m.price)} is ${over || "just"}${over ? "%" : ""} over their ${dollars(buyer.budgetMax)} budget.` };
}

function commuteFactor(buyer: Buyer, m: Match): Factor {
  const base = { key: "commute" as const, label: "Commute" };
  const timed = m.distances.filter((d) => d.minutes != null);
  if (!timed.length) return { ...base, effect: "neutral", detail: "No drive times for this home yet." };
  const times = timed.map((d) => `${d.minutes} min to ${d.label}`).join(", ");
  const limit = buyer.maxDriveMinutes;
  if (!limit) return { ...base, effect: "neutral", detail: `${times}. No drive limit is set.` };
  const over = timed.some((d) => d.minutes! > limit);
  return { ...base, effect: over ? "hurt" : "helped", detail: `${times} (their limit is ${limit} min).` };
}

function sizeFactor(buyer: Buyer, m: Match): Factor {
  const base = { key: "size" as const, label: "Size" };
  if (m.sqft == null) return { ...base, effect: "neutral", detail: "Square footage isn't listed." };
  const sqft = `${m.sqft.toLocaleString("en-US")} sqft`;
  if (!buyer.sqftMin) return { ...base, effect: "neutral", detail: `${sqft}. No minimum size is set.` };
  const enough = m.sqft >= buyer.sqftMin;
  return { ...base, effect: enough ? "helped" : "hurt", detail: `${sqft} against a ${buyer.sqftMin.toLocaleString("en-US")} sqft minimum.` };
}

function roomsFactor(buyer: Buyer, m: Match): Factor {
  const base = { key: "rooms" as const, label: "Beds and baths" };
  const have = [m.beds != null ? `${m.beds} bd` : null, m.baths != null ? `${m.baths} ba` : null].filter(Boolean).join(", ");
  if (!have) return { ...base, effect: "neutral", detail: "Bedrooms and bathrooms aren't listed." };
  const want = [buyer.bedsMin ? `${buyer.bedsMin}+ bd` : null, buyer.bathsMin ? `${buyer.bathsMin}+ ba` : null].filter(Boolean).join(", ");
  if (!want) return { ...base, effect: "neutral", detail: `${have}. No minimums are set.` };
  const short =
    (buyer.bedsMin != null && m.beds != null && m.beds < buyer.bedsMin) ||
    (buyer.bathsMin != null && m.baths != null && m.baths < buyer.bathsMin);
  return { ...base, effect: short ? "hurt" : "helped", detail: `${have}; they want ${want}.` };
}

function areaFactor(m: Match): Factor {
  return {
    key: "area",
    label: "Area match",
    effect: m.inArea ? "helped" : "hurt",
    detail: m.areaNote || (m.inArea ? "Inside their target area." : "Outside their target area."),
  };
}

/** The drive-time penalty adds its own line to cons; the commute factor already covers it. */
const isDriveNote = (s: string) => /min drive to/i.test(s);

function preferenceFactors(m: Match): Factor[] {
  const cons = m.cons.filter((c) => !isDriveNote(c));
  const out: Factor[] = [];
  if (m.pros.length) out.push({ key: "wishes", label: "Client preferences", effect: "helped", detail: m.pros.join(" · ") });
  if (cons.length) out.push({ key: "tradeoffs", label: "Trade-offs", effect: "hurt", detail: cons.join(" · ") });
  return out;
}

function feedbackFactor(adjustment: Adjustment): Factor {
  const base = { key: "feedback" as const, label: "Past feedback" };
  if (!adjustment.notes.length) {
    return { ...base, effect: "neutral", detail: "Nothing learned yet. Save and reject homes to teach AgentPulse what they like." };
  }
  const points = `${adjustment.delta > 0 ? "+" : ""}${adjustment.delta}`;
  const effect = adjustment.delta > 0 ? "helped" : adjustment.delta < 0 ? "hurt" : "neutral";
  return { ...base, effect, detail: `${adjustment.notes.join(". ")} (${points}).` };
}

/** What helped and hurt this home's score, in the order an agent would talk it through. */
export function explainScore(buyer: Buyer, match: Match, adjustment: Adjustment): Factor[] {
  return [
    priceFactor(buyer, match),
    commuteFactor(buyer, match),
    sizeFactor(buyer, match),
    roomsFactor(buyer, match),
    areaFactor(match),
    ...preferenceFactors(match),
    feedbackFactor(adjustment),
  ];
}

function homeLine(h: HomeFacts) {
  const facts = [
    h.price != null ? dollars(h.price) : null,
    h.beds != null ? `${h.beds} bd` : null,
    h.sqft != null ? `${h.sqft.toLocaleString("en-US")} sqft` : null,
  ].filter(Boolean);
  return [[h.address, h.city].filter(Boolean).join(", ") || "A home", facts.join(", ")].filter(Boolean).join(" — ");
}

/** One line per piece of feedback, newest first. Notes are quoted as data, never instructions. */
export function feedbackLines(entries: FeedbackEntry[], limit = 12): string[] {
  return entries.slice(0, limit).map((e) => {
    const who = e.source === "client" ? "the client" : "the agent";
    const why = e.reasons.length ? ` because of ${e.reasons.join(", ")}` : "";
    const note = e.note ? ` Their note: "${e.note.replace(/["\n]/g, " ").slice(0, 200)}"` : "";
    const verb = isPositive(e) ? "LIKED" : "REJECTED";
    return `- ${verb} by ${who}${why}: ${homeLine(e.home)}.${note}`;
  });
}

/**
 * Feedback as plain text for the search prompt, so the AI looks for more of what they liked
 * and scores look-alikes of rejected homes lower.
 */
export function feedbackForPrompt(entries: FeedbackEntry[]): string {
  if (!entries.length) return "";
  return `\n\nFeedback on homes shown so far. Look for homes like the liked ones, avoid look-alikes of the rejected ones, and let it move your scores:\n${feedbackLines(entries).join("\n")}`;
}
