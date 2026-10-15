import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { HttpError } from "./auth";
import type { Buyer } from "./db/schema";
import { ProfilePatch, patchToUpdate } from "./profile";

/** Loads a buyer, making sure it belongs to this agent (agents never see each other's buyers). */
export async function getOwnedBuyer(agentId: string, buyerId: string): Promise<Buyer> {
  const db = await getDb();
  const [buyer] = await db
    .select()
    .from(schema.buyers)
    .where(and(eq(schema.buyers.id, buyerId), eq(schema.buyers.agentId, agentId)))
    .limit(1);
  if (!buyer) throw new HttpError(404, "Buyer not found.");
  return buyer;
}

/** Removes null values Claude sometimes sends for "unknown" fields. */
export function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripNulls) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, stripNulls(v)]),
    ) as T;
  }
  return value;
}

const CLEARABLE = [
  "email",
  "phone",
  "budgetMin",
  "budgetMax",
  "bedsMin",
  "bathsMin",
  "sqftMin",
  "maxDriveMinutes",
  "timeline",
  "notes",
  "aiSummary",
] as const;

/**
 * Applies a profile change. From the AI, null means "unknown" and is ignored.
 * From the edit form (`allowClear`), null on a clearable field means "erase it".
 */
export async function applyProfilePatch(
  buyer: Buyer,
  raw: unknown,
  opts: { allowClear?: boolean } = {},
): Promise<{ buyer: Buyer; patch: ProfilePatch }> {
  const patch = ProfilePatch.parse(stripNulls(raw));
  const update = patchToUpdate(buyer, patch);
  if (opts.allowClear && raw && typeof raw === "object") {
    for (const key of CLEARABLE) {
      if ((raw as Record<string, unknown>)[key] === null) (update as Record<string, unknown>)[key] = null;
    }
  }
  const db = await getDb();
  const [updated] = await db
    .update(schema.buyers)
    .set(update)
    .where(eq(schema.buyers.id, buyer.id))
    .returning();
  return { buyer: updated, patch };
}
