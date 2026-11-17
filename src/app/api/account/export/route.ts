import { handler } from "@/lib/api";
import { exportAccount } from "@/lib/account";
import { apiAgent } from "@/lib/auth";
import { limit } from "@/lib/rate-limit";

/** Downloads everything AgentPulse holds for the logged-in agent as one JSON file. */
export const GET = handler(async () => {
  const agent = await apiAgent();
  limit([`export:${agent.id}`], 5, 15);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(await exportAccount(agent), null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="agentpulse-export-${day}.json"`,
      "cache-control": "no-store",
    },
  });
});
