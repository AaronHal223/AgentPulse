import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db";
import type { Agent, Alert, Buyer, Match } from "../db/schema";
import { raiseAlerts } from "../alerts";
import { stripNulls } from "../buyers";
import { formatPrice } from "../format";
import { checkedValues, detectChanges, LISTING_STATUSES, type ListingCheck } from "../listing-changes";
import { runAgent, type ToolSpec } from "./provider";

// A few homes per run keeps each check inside one AI request; the stalest go first.
const HOMES_PER_RUN = 8;

const reportTool: ToolSpec = {
  name: "report_listing_status",
  description: "Report what each listing looks like right now. Call exactly once, with one entry per home you were given.",
  schema: {
    type: "object",
    properties: {
      listings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: { type: "string", description: "The exact URL you were given for this home." },
            status: {
              type: "string",
              enum: [...LISTING_STATUSES, "unknown"],
              description: "active = for sale/rent now; pending = under contract; sold = sold or rented; off_market = removed; unknown = couldn't confirm.",
            },
            price: { type: "integer", description: "Current list price in USD (monthly rent for rentals), if shown." },
          },
          required: ["url", "status"],
        },
      },
    },
    required: ["listings"],
  },
};

const Checked = z.object({
  url: z.string(),
  status: z.enum([...LISTING_STATUSES, "unknown"]),
  price: z.coerce.number().int().positive().optional(),
});

const SYSTEM = `You re-check real estate listings for an agent. For each home you're given, find out whether it is still available and what it is listed for today.

Open the listing page with web_fetch. If the site blocks you, search the web for the address and use another site's page for the same home. Never guess: if you can't confirm a home's status from a page or search result you actually saw, report it as "unknown" and leave the price out.

When you're done, call report_listing_status exactly once.`;

function homeLine(m: Match) {
  const where = [m.address, m.city, m.state].filter(Boolean).join(", ") || "address unknown";
  return `- ${m.url}\n  ${where}. Last seen: ${m.listingStatus}, ${formatPrice(m)}.`;
}

async function savedHomesDue(buyerId: string): Promise<Match[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.matches)
    .where(and(eq(schema.matches.buyerId, buyerId), eq(schema.matches.status, "saved"), ne(schema.matches.listingStatus, "sold")))
    .orderBy(sql`${schema.matches.lastCheckedAt} asc nulls first`)
    .limit(HOMES_PER_RUN);
}

function parseChecks(raw: unknown): Map<string, ListingCheck> {
  const checks = new Map<string, ListingCheck>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const parsed = Checked.safeParse(stripNulls(item));
    if (parsed.success) checks.set(parsed.data.url, { status: parsed.data.status, price: parsed.data.price });
  }
  return checks;
}

/**
 * Looks at a client's saved homes again and raises an alert for every price drop, status
 * change and home that came back on the market.
 */
export async function recheckSavedHomes(agent: Agent, buyer: Buyer, opts: { push?: boolean } = {}): Promise<{ homes: Match[]; alerts: Alert[] }> {
  const homes = await savedHomesDue(buyer.id);
  if (!homes.length) return { homes: [], alerts: [] };

  let raw: unknown = [];
  await runAgent({
    system: SYSTEM,
    messages: [{ role: "user", content: `Re-check these ${homes.length} homes:\n${homes.map(homeLine).join("\n")}` }],
    tools: [reportTool],
    web: { searches: homes.length, pageReads: homes.length },
    maxTokens: 6000,
    maxSteps: 16,
    finalTool: "report_listing_status",
    onClientTool: async (name, input) => {
      if (name !== "report_listing_status") return { result: `Unknown tool ${name}` };
      raw = (input as { listings?: unknown }).listings;
      return { result: "Saved.", stop: true };
    },
  });

  const checks = parseChecks(raw);
  const db = await getDb();
  const alerts: Alert[] = [];
  const checked: Match[] = [];
  for (const home of homes) {
    // A home the AI skipped still counts as looked at, so the next run moves on to others.
    const check = checks.get(home.url) ?? { status: "unknown" as const };
    const [updated] = await db.update(schema.matches).set(checkedValues(check)).where(eq(schema.matches.id, home.id)).returning();
    checked.push(updated);
    const target = { agentId: agent.id, buyerId: buyer.id, matchId: home.id };
    alerts.push(...(await raiseAlerts(target, detectChanges(home, check), opts)));
  }
  return { homes: checked, alerts };
}
