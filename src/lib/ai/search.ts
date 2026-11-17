import "server-only";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import type { Agent, Alert, Buyer, Match } from "../db/schema";
import { alertNewMatches } from "../alerts";
import { stripNulls } from "../buyers";
import { profileForPrompt } from "../profile";
import { distancesFrom, geocode, geocodeAnchors } from "../geo";
import { loadFeedback } from "../feedback";
import { clampScore, drivePenalty, feedbackAdjustment, feedbackForPrompt, type FeedbackEntry } from "../scoring";
import { rentcastListings, type Candidate } from "../listings/rentcast";
import { FAIR_HOUSING_RULES, keepFairCopy } from "../fair-housing";
import { runAgent, type ToolSpec } from "./provider";

const listingProps = {
  url: { type: "string", description: "Direct URL of the listing page you found." },
  source: { type: "string", description: "Site name, e.g. Zillow, Redfin, Realtor.com, Apartments.com, brokerage name." },
  listingType: { type: "string", enum: ["sale", "rent"] },
  address: { type: "string", description: "Street address (or best available)." },
  city: { type: "string" },
  state: { type: "string", description: "2-letter state." },
  zip: { type: "string" },
  price: { type: "integer", description: "List price in USD, or monthly rent for rentals." },
  beds: { type: "number" },
  baths: { type: "number" },
  sqft: { type: "integer" },
  propertyType: { type: "string" },
  lat: { type: "number" },
  lng: { type: "number" },
  summary: {
    type: "string",
    description: "2–3 factual sentences: what the home is, its condition/features and anything notable in the listing.",
  },
  blurb: {
    type: "string",
    description:
      "1–2 warm sentences the agent could text the buyer, written to THIS buyer about why it might suit them.",
  },
  score: {
    type: "integer",
    minimum: 1,
    maximum: 10,
    description: "Fit for THIS buyer, 1–10, using the rubric in the instructions.",
  },
  reasoning: { type: "string", description: "One or two sentences explaining the score." },
  pros: { type: "array", items: { type: "string" }, description: "Up to 4 short points." },
  cons: { type: "array", items: { type: "string" }, description: "Up to 4 short points." },
  inArea: {
    type: "boolean",
    description: "True if the home is inside (or genuinely part of) the buyer's target areas; false if it isn't.",
  },
  areaNote: { type: "string", description: "One sentence on how the location fits the target areas and important places." },
} as const;

const reportTool: ToolSpec = {
  name: "report_listings",
  description: "Report the listings you found and evaluated. Call exactly once at the end.",
  schema: {
    type: "object",
    properties: {
      listings: {
        type: "array",
        items: {
          type: "object",
          properties: listingProps,
          required: ["url", "summary", "blurb", "score", "reasoning", "inArea"],
        },
      },
      notes: { type: "string", description: "Optional note for the agent about the search (e.g. thin inventory)." },
    },
    required: ["listings"],
  },
};

const Listing = z.object({
  url: z.string().url(),
  source: z.string().max(80).optional(),
  listingType: z.enum(["sale", "rent"]).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(40).optional(),
  zip: z.string().max(20).optional(),
  price: z.coerce.number().int().nonnegative().optional(),
  beds: z.coerce.number().nonnegative().optional(),
  baths: z.coerce.number().nonnegative().optional(),
  sqft: z.coerce.number().int().nonnegative().optional(),
  propertyType: z.string().max(80).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  summary: z.string().max(2000),
  blurb: z.string().max(1000),
  score: z.coerce.number().int().min(1).max(10),
  reasoning: z.string().max(2000),
  pros: z.array(z.string().max(200)).max(8).optional(),
  cons: z.array(z.string().max(200)).max(8).optional(),
  inArea: z.boolean(),
  areaNote: z.string().max(1000).optional(),
});
type Listing = z.infer<typeof Listing>;

const RUBRIC = `Scoring rubric (1–10) for THIS buyer:
- 9–10: In a target area, within budget, meets every must-have, no deal-breakers, convenient to their important places.
- 7–8: Strong fit with one small compromise (slightly over budget, one nice-to-have missing, a bit longer drive).
- 5–6: Workable but with real trade-offs.
- 3–4: Significant problems (over budget >10%, missing a must-have, too far from important places).
- 1–2: Hits a deal-breaker or clearly wrong for them.
Judge the location honestly: if a home is not actually in or right next to the target areas, set inArea=false and explain in areaNote.

${FAIR_HOUSING_RULES}`;

function searchSystem(agent: Agent) {
  const today = new Date().toLocaleDateString("en-US", { dateStyle: "full" });
  return `You are AgentPulse's home-search engine, working for real estate agent ${agent.name}${
    agent.marketArea ? ` in the ${agent.marketArea} market` : ""
  }. Today is ${today}.

Your job: search the web the way a sharp agent would on Google, find homes that are CURRENTLY listed and match the client, read the listing pages, and evaluate each one for this specific client.

Where to look: Zillow, Redfin, Realtor.com, Homes.com, Trulia, Compass and local brokerage sites; for rentals also Apartments.com, Zumper, HotPads, Rent.com and property-management sites. Use several targeted searches (area + price + beds + type, e.g. "3 bed house for sale Haddonfield NJ under $600,000"). Use web_fetch to open promising listing pages for details. Some big portals block page fetches — if so, rely on search results and find the same listing on another site to confirm price, beds/baths and that it's still active.

Rules:
- Only include listings that appear active (not sold, pending, rented or off-market).
- Match the client's buy/rent intent.
- Never invent facts. If something (sqft, baths) isn't stated anywhere, leave it out.
- Prefer quality over quantity: evaluate each candidate carefully. Include homes outside the target area only if they are genuinely compelling, and mark them inArea=false.
- Use a direct listing URL for each home.

${RUBRIC}

When you're done, call report_listings exactly once.`;
}

function normalizeAddress(a?: string | null) {
  return (a ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/(apt|unit|suite)/g, "");
}

async function enrichAndSave(
  buyer: Buyer,
  listings: Listing[],
  origin: "search" | "link",
  feedback: FeedbackEntry[],
): Promise<Match[]> {
  const db = await getDb();

  // Make sure the buyer's important places have coordinates (saved back to the profile).
  const { anchors, changed } = await geocodeAnchors(buyer.anchors);
  if (changed) await db.update(schema.buyers).set({ anchors }).where(eq(schema.buyers.id, buyer.id));

  const existing = await db
    .select({ id: schema.matches.id, url: schema.matches.url, address: schema.matches.address })
    .from(schema.matches)
    .where(eq(schema.matches.buyerId, buyer.id));
  const seenUrls = new Set(existing.map((e) => e.url));
  const idByUrl = new Map(existing.map((e) => [e.url, e.id]));
  const seenAddrs = new Set(existing.map((e) => normalizeAddress(e.address)).filter(Boolean));

  const saved: Match[] = [];
  for (const l of listings) {
    const addrKey = normalizeAddress(l.address);
    const duplicate = seenUrls.has(l.url) || (addrKey && seenAddrs.has(addrKey));
    if (duplicate && origin === "search") continue;

    let home = l.lat != null && l.lng != null ? { lat: l.lat, lng: l.lng } : null;
    const fullAddress = [l.address, l.city, l.state, l.zip].filter(Boolean).join(", ");
    if (!home && fullAddress) home = await geocode(fullAddress);
    const distances = await distancesFrom(home, anchors);

    const drive = drivePenalty(distances, buyer.maxDriveMinutes);
    const cons = [...(l.cons ?? []), ...drive.cons];
    const baseScore = clampScore(l.score - drive.points);
    // Then let what the agent and client said about earlier homes move it.
    const facts = {
      id: idByUrl.get(l.url) ?? "",
      address: l.address ?? null,
      city: l.city ?? null,
      zip: l.zip ?? null,
      price: l.price ?? null,
      sqft: l.sqft ?? null,
      beds: l.beds ?? null,
      baths: l.baths ?? null,
    };
    const score = clampScore(baseScore + feedbackAdjustment(facts, feedback).delta);

    const values = {
      buyerId: buyer.id,
      url: l.url,
      source: l.source ?? null,
      listingType: l.listingType ?? (buyer.intent === "rent" ? "rent" : "sale"),
      address: l.address ?? null,
      city: l.city ?? null,
      state: l.state ?? null,
      zip: l.zip ?? null,
      price: l.price ?? null,
      beds: l.beds ?? null,
      baths: l.baths ?? null,
      sqft: l.sqft ?? null,
      propertyType: l.propertyType ?? null,
      // The blurb is written to be sent to the client, so wording that could read as steering is dropped.
      summary: keepFairCopy(l.summary),
      blurb: keepFairCopy(l.blurb),
      score,
      baseScore,
      reasoning: l.reasoning,
      pros: l.pros ?? [],
      cons,
      inArea: l.inArea,
      areaNote: l.areaNote ?? null,
      lat: home?.lat ?? null,
      lng: home?.lng ?? null,
      distances,
      origin,
    };

    const [row] = await db
      .insert(schema.matches)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.matches.buyerId, schema.matches.url],
        set: { ...values, createdAt: new Date() },
      })
      .returning();
    saved.push(row);
    seenUrls.add(l.url);
    if (addrKey) seenAddrs.add(addrKey);
  }
  return saved;
}

function parseListings(raw: unknown): Listing[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: Listing[] = [];
  for (const item of arr) {
    const p = Listing.safeParse(stripNulls(item));
    if (p.success) out.push(p.data);
  }
  return out;
}

const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/**
 * When the AI reports which pages it really looked at, keep only listings on those sites, so a
 * made-up link never reaches the agent.
 */
function onPagesFound(listings: Listing[], sources?: string[]): Listing[] {
  if (!sources) return listings;
  const sites = new Set(sources.map(siteOf).filter(Boolean));
  return listings.filter((l) => sites.has(siteOf(l.url)));
}

const fitProps = {
  ref: { type: "string", description: "The ref of the home, exactly as given." },
  summary: listingProps.summary,
  blurb: listingProps.blurb,
  score: listingProps.score,
  reasoning: listingProps.reasoning,
  pros: listingProps.pros,
  cons: listingProps.cons,
  inArea: listingProps.inArea,
  areaNote: listingProps.areaNote,
};

const fitTool: ToolSpec = {
  name: "report_fit",
  description: "Report your evaluation of each home. Call exactly once, with one entry per home worth showing the agent.",
  schema: {
    type: "object",
    properties: { homes: { type: "array", items: { type: "object", properties: fitProps, required: ["ref", "summary", "blurb", "score", "reasoning", "inArea"] } } },
    required: ["homes"],
  },
};

const MAX_TO_JUDGE = 12;

function candidateLine(c: Candidate) {
  const facts = [
    c.price != null ? `$${c.price.toLocaleString("en-US")}${c.listingType === "rent" ? "/mo" : ""}` : null,
    c.beds != null ? `${c.beds} bd` : null,
    c.baths != null ? `${c.baths} ba` : null,
    c.sqft != null ? `${c.sqft.toLocaleString("en-US")} sqft` : null,
    c.propertyType,
    c.yearBuilt ? `built ${c.yearBuilt}` : null,
    c.daysOnMarket != null ? `${c.daysOnMarket} days on market` : null,
  ].filter(Boolean);
  return `- ref ${c.ref}: ${[c.address, c.city, c.state, c.zip].filter(Boolean).join(", ")}. ${facts.join(", ")}.`;
}

/**
 * Has the AI judge real listings from the feed. The facts (price, beds, address) come from the
 * feed and stay as they are; the AI only adds the score and the words.
 */
async function judgeCandidates(agent: Agent, buyer: Buyer, candidates: Candidate[], feedback: FeedbackEntry[]): Promise<Listing[]> {
  let raw: unknown = [];
  await runAgent({
    system: `You evaluate real, currently listed homes for real estate agent ${agent.name}'s client. The listing facts come from an MLS feed; trust them and never contradict or embellish them. You don't have photos or descriptions, so base the summary on the facts given and say nothing you can't know.

${RUBRIC}

Leave out homes that clearly don't fit (score 1–3) unless there are very few. Call report_fit exactly once.`,
    messages: [
      {
        role: "user",
        content: `<client>\n${profileForPrompt(buyer)}\n</client>${feedbackForPrompt(feedback)}\n\nHomes listed now:\n${candidates.map(candidateLine).join("\n")}`,
      },
    ],
    tools: [fitTool],
    maxTokens: 12000,
    finalTool: "report_fit",
    onClientTool: async (name, input) => {
      if (name === "report_fit") raw = (input as { homes?: unknown }).homes;
      return { result: "Saved.", stop: true };
    },
  });

  const byRef = new Map(candidates.map((c) => [c.ref, c]));
  return (Array.isArray(raw) ? raw : []).flatMap((item) => {
    const judged = item as { ref?: unknown };
    const facts = typeof judged.ref === "string" ? byRef.get(judged.ref) : undefined;
    if (!facts) return []; // a home the feed never gave us
    const { ref: _ref, yearBuilt: _built, daysOnMarket: _days, ...listing } = facts;
    const parsed = Listing.safeParse(stripNulls({ ...(item as object), ...listing }));
    return parsed.success ? [parsed.data] : [];
  });
}

type Known = { url: string; address: string | null };

function isKnown(known: Known[], c: Candidate) {
  const addr = normalizeAddress(c.address);
  return known.some((k) => k.url === c.url || (addr && normalizeAddress(k.address) === addr));
}

/** Real listings from the feed when it's set up and has something new; otherwise null. */
async function searchFeed(agent: Agent, buyer: Buyer, known: Known[], feedback: FeedbackEntry[]) {
  const { candidates, note } = await rentcastListings(buyer);
  const fresh = candidates.filter((c) => !isKnown(known, c)).slice(0, MAX_TO_JUDGE);
  if (!fresh.length) return { listings: null, note };
  const listings = await judgeCandidates(agent, buyer, fresh, feedback);
  return { listings, note: note ?? `Checked ${fresh.length} new listing${fresh.length === 1 ? "" : "s"} from the MLS feed.` };
}

/**
 * Finds homes for one buyer, scores them and saves new matches: from the listings feed when
 * it's set up, otherwise by searching the web. Strong new matches raise an alert; `push` also
 * sends it to the agent's phone (for scheduled runs).
 */
export async function searchHomesForBuyer(
  agent: Agent,
  buyer: Buyer,
  opts: { maxListings?: number; push?: boolean } = {},
): Promise<{ matches: Match[]; alerts: Alert[]; notes?: string }> {
  const db = await getDb();
  const known = await db
    .select({ url: schema.matches.url, address: schema.matches.address })
    .from(schema.matches)
    .where(eq(schema.matches.buyerId, buyer.id))
    .orderBy(desc(schema.matches.createdAt))
    .limit(200);
  const feedback = await loadFeedback(buyer.id);

  const feed = await searchFeed(agent, buyer, known, feedback);
  const { listings, notes } = feed.listings
    ? { listings: feed.listings, notes: feed.note }
    : await searchWeb(agent, buyer, known.slice(0, 60), feedback, opts.maxListings ?? 8, feed.note);

  const matches = await enrichAndSave(buyer, listings, "search", feedback);
  await db.update(schema.buyers).set({ lastSearchedAt: new Date() }).where(eq(schema.buyers.id, buyer.id));
  const alerts = await alertNewMatches(agent.id, buyer, matches, { push: opts.push ?? false });
  return { matches, alerts, notes };
}

/** The AI searches the web (Zillow, Redfin, rentals sites…) for listings and judges them. */
async function searchWeb(agent: Agent, buyer: Buyer, known: Known[], feedback: FeedbackEntry[], max: number, feedNote?: string) {
  const knownList = known.length
    ? `\n\nAlready found earlier (skip these, look for different homes):\n${known
        .map((k) => `- ${k.address ?? ""} ${k.url}`)
        .join("\n")}`
    : "";

  let raw: unknown = [];
  let notes: string | undefined;
  const { sources } = await runAgent({
    system: searchSystem(agent),
    messages: [
      {
        role: "user",
        content: `Find up to ${max} homes ${buyer.intent === "rent" ? "for RENT" : "for SALE"} for this client and evaluate each one.\n\n<client>\n${profileForPrompt(buyer)}\n</client>${feedbackForPrompt(feedback)}${knownList}`,
      },
    ],
    tools: [reportTool],
    web: { searches: 12, pageReads: 12 },
    maxTokens: 16000,
    maxSteps: 20,
    finalTool: "report_listings",
    onClientTool: async (name, input) => {
      if (name !== "report_listings") return { result: `Unknown tool ${name}` };
      raw = (input as { listings?: unknown }).listings;
      notes = (input as { notes?: string }).notes;
      return { result: "Saved.", stop: true };
    },
  });

  const found = parseListings(raw);
  const confirmed = onPagesFound(found, sources);
  const skipped = found.length - confirmed.length;
  const skippedNote = skipped ? `Skipped ${skipped} result${skipped === 1 ? "" : "s"} whose link couldn't be confirmed.` : undefined;
  return { listings: confirmed, notes: [feedNote, notes, skippedNote].filter(Boolean).join(" ") || undefined };
}

/** Evaluates one specific listing link (Zillow, Redfin, anything) for a buyer. */
export async function analyzeListingLink(agent: Agent, buyer: Buyer, url: string): Promise<Match | null> {
  const feedback = await loadFeedback(buyer.id);
  let raw: unknown = [];
  await runAgent({
    system: searchSystem(agent),
    messages: [
      {
        role: "user",
        content: `The agent wants to know how well this specific home fits their client: ${url}

Open it with web_fetch. If the site blocks the fetch, search the web for the address or listing ID to get the details from another source. Then evaluate it for this client and call report_listings with exactly one listing (use the URL above).

<client>
${profileForPrompt(buyer)}
</client>${feedbackForPrompt(feedback)}`,
      },
    ],
    tools: [reportTool],
    web: { searches: 4, pageReads: 4 },
    maxTokens: 6000,
    maxSteps: 10,
    finalTool: "report_listings",
    onClientTool: async (name, input) => {
      if (name !== "report_listings") return { result: `Unknown tool ${name}` };
      raw = (input as { listings?: unknown }).listings;
      return { result: "Saved.", stop: true };
    },
  });
  const listings = parseListings(raw).map((l, i) => (i === 0 ? { ...l, url } : l)).slice(0, 1);
  const [match] = await enrichAndSave(buyer, listings, "link", feedback);
  return match ?? null;
}
