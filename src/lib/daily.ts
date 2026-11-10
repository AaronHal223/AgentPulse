import "server-only";
import type { Agent, Buyer } from "./db/schema";
import { recheckSavedHomes } from "./ai/recheck";
import { searchHomesForBuyer } from "./ai/search";

/**
 * One client's share of the morning run: look for new homes, then look again at the ones the
 * agent saved. The daily schedule (GitHub Actions → /api/cron/search, or `npm run brief`) calls this.
 */
export async function dailyRunForBuyer(agent: Agent, buyer: Buyer): Promise<{ found: number; checked: number; alerts: number }> {
  const { matches, alerts: matchAlerts } = await searchHomesForBuyer(agent, buyer, { push: true });
  // The search already succeeded; a failed re-check (say, the AI's daily limit) just waits for tomorrow.
  const recheck = await recheckSavedHomes(agent, buyer).catch((err) => {
    console.warn(`re-check failed for client ${buyer.id}:`, err instanceof Error ? err.message : err);
    return { homes: [], alerts: [] };
  });
  return { found: matches.length, checked: recheck.homes.length, alerts: matchAlerts.length + recheck.alerts.length };
}
