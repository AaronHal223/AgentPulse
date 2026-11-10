import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Agent, Buyer, Match, ShareLink } from "./db/schema";
import { HttpError } from "./errors";
import { setClientVerdict } from "./feedback";
import { secret } from "./session";

export const SHARE_LINK_DAYS = 30;

const TOKEN_BYTES = 32; // 256 bits: far too long to guess
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const sealKey = () => createHash("sha256").update("agentpulse-share-link:").update(secret()).digest();

/** Encrypts a token so a copy of the database alone can't be used to open client pages. */
function seal(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** Returns null if the secret changed since the link was made; the link itself still works. */
function unseal(sealed: string): string | null {
  try {
    const raw = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", sealKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

const isLive = (link: ShareLink, now = new Date()) => !link.revokedAt && link.expiresAt > now;

/** The client's current link, if they have one that still works. */
export async function activeShareLink(buyerId: string): Promise<{ link: ShareLink; token: string | null } | null> {
  const db = await getDb();
  const [link] = await db
    .select()
    .from(schema.shareLinks)
    .where(and(eq(schema.shareLinks.buyerId, buyerId), isNull(schema.shareLinks.revokedAt), gt(schema.shareLinks.expiresAt, new Date())))
    .orderBy(desc(schema.shareLinks.createdAt))
    .limit(1);
  return link ? { link, token: unseal(link.tokenSealed) } : null;
}

/** Turns off every link for a client. Old links stop working immediately. */
export async function revokeShareLinks(buyerId: string) {
  const db = await getDb();
  await db
    .update(schema.shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.shareLinks.buyerId, buyerId), isNull(schema.shareLinks.revokedAt)));
}

/** Makes a fresh link for a client and retires any earlier one. */
export async function createShareLink(buyerId: string): Promise<{ link: ShareLink; token: string }> {
  await revokeShareLinks(buyerId);
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const db = await getDb();
  const [link] = await db
    .insert(schema.shareLinks)
    .values({
      buyerId,
      tokenHash: hashToken(token),
      tokenSealed: seal(token),
      expiresAt: new Date(Date.now() + SHARE_LINK_DAYS * 24 * 3600 * 1000),
    })
    .returning();
  return { link, token };
}

export type SharedPage = { link: ShareLink; buyer: Buyer; agent: Agent };

/** Looks up a link from its token. Null for anything unknown, revoked or expired. */
export async function resolveShareToken(token: string): Promise<SharedPage | null> {
  if (!TOKEN_SHAPE.test(token)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ link: schema.shareLinks, buyer: schema.buyers, agent: schema.agents })
    .from(schema.shareLinks)
    .innerJoin(schema.buyers, eq(schema.shareLinks.buyerId, schema.buyers.id))
    .innerJoin(schema.agents, eq(schema.buyers.agentId, schema.agents.id))
    .where(eq(schema.shareLinks.tokenHash, hashToken(token)))
    .limit(1);
  return row && isLive(row.link) ? row : null;
}

export async function recordView(link: ShareLink) {
  const db = await getDb();
  await db
    .update(schema.shareLinks)
    .set({ lastViewedAt: new Date(), viewCount: sql`${schema.shareLinks.viewCount} + 1` })
    .where(eq(schema.shareLinks.id, link.id));
}

/** Everything a client is allowed to see about a home: the listing facts and the agent's blurb. */
export type SharedHome = Pick<
  Match,
  "id" | "url" | "source" | "listingType" | "address" | "city" | "state" | "price" | "beds" | "baths" | "sqft" | "propertyType" | "summary" | "blurb" | "distances"
> & { reaction: "liked" | "disliked" | null; note: string | null };

const visibleToClient = (buyerId: string) =>
  and(eq(schema.matches.buyerId, buyerId), isNotNull(schema.matches.sentAt), ne(schema.matches.status, "dismissed"));

/** The homes the agent chose to send, newest first, with the client's own reactions. */
export async function sharedHomes(buyerId: string): Promise<SharedHome[]> {
  const db = await getDb();
  const rows = await db
    .select({ home: schema.matches, feedback: schema.matchFeedback })
    .from(schema.matches)
    .leftJoin(schema.matchFeedback, and(eq(schema.matchFeedback.matchId, schema.matches.id), eq(schema.matchFeedback.source, "client")))
    .where(visibleToClient(buyerId))
    .orderBy(desc(schema.matches.sentAt));
  return rows.map(({ home: h, feedback }) => ({
    id: h.id,
    url: h.url,
    source: h.source,
    listingType: h.listingType,
    address: h.address,
    city: h.city,
    state: h.state,
    price: h.price,
    beds: h.beds,
    baths: h.baths,
    sqft: h.sqft,
    propertyType: h.propertyType,
    summary: h.summary,
    blurb: h.blurb,
    distances: h.distances,
    reaction: feedback?.verdict === "liked" || feedback?.verdict === "disliked" ? feedback.verdict : null,
    note: feedback?.note ?? null,
  }));
}

/** Saves a client's reaction, but only for a home their agent actually sent them. */
export async function recordClientReaction(
  page: SharedPage,
  matchId: string,
  reaction: "liked" | "disliked" | null,
  note?: string | null,
) {
  const db = await getDb();
  const [home] = await db
    .select()
    .from(schema.matches)
    .where(and(eq(schema.matches.id, matchId), visibleToClient(page.buyer.id)))
    .limit(1);
  if (!home) throw new HttpError(404, "That home isn't on this page any more.");
  await setClientVerdict(home, reaction, note);
}
