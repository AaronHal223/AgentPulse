import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { getDb, schema } from "../db";
import type { Agent, Buyer } from "../db/schema";
import { stripNulls } from "../buyers";
import { ProfilePatch, patchToUpdate, profileFieldsJsonSchema } from "../profile";
import { runAgentLoop, webFetchTool } from "./claude";

const createBuyersTool: Anthropic.Messages.Tool = {
  name: "create_buyer_profiles",
  description:
    "Create one buyer/renter profile per distinct client found in the imported material. Call this exactly once with every client.",
  input_schema: {
    type: "object",
    properties: {
      buyers: {
        type: "array",
        items: {
          type: "object",
          properties: profileFieldsJsonSchema as unknown as Record<string, unknown>,
          required: ["name"],
        },
      },
    },
    required: ["buyers"],
  },
};

const SYSTEM = `You import client information for a real estate agent into AgentPulse buyer profiles.

The agent will paste material from anywhere: a CSV/spreadsheet export from their CRM or website, an email or text thread from a client, intake-form answers, notes from a call, or links to a client profile page. If the material includes links, use web_fetch to read them.

Extract every distinct client and call create_buyer_profiles once. Rules:
- One profile per client/household. Map whatever columns or wording exist onto the profile fields.
- Budgets in whole US dollars (monthly rent for renters). "450k" → 450000.
- intent is "rent" only if they are clearly looking to rent/lease; otherwise "buy".
- Put places they need to be near (job, school, family, gym) in anchors with the best address you have.
- Put anything useful that doesn't fit a field into notesToAppend. Write a short aiSummary for each.
- Never invent details that aren't in the material.`;

export async function importBuyers(agent: Agent, material: string): Promise<Buyer[]> {
  let raw: unknown[] = [];
  await runAgentLoop({
    system: SYSTEM,
    messages: [{ role: "user", content: `Import these clients:\n\n<material>\n${material}\n</material>` }],
    tools: [createBuyersTool, webFetchTool(5)],
    maxTokens: 32000,
    requireTool: "create_buyer_profiles",
    onClientTool: async (name, input) => {
      if (name === "create_buyer_profiles") {
        raw = ((input as { buyers?: unknown[] }).buyers ?? []) as unknown[];
        return { result: "Created.", stop: true };
      }
      return { result: `Unknown tool ${name}` };
    },
  });

  const db = await getDb();
  const created: Buyer[] = [];
  for (const item of raw) {
    const parsed = ProfilePatch.safeParse(stripNulls(item));
    if (!parsed.success) continue;
    const update = patchToUpdate(null, parsed.data);
    const [buyer] = await db
      .insert(schema.buyers)
      .values({ ...update, name: (update.name as string | undefined) || "Unnamed client", agentId: agent.id })
      .returning();
    created.push(buyer);
  }
  return created;
}
