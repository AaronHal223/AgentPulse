import "server-only";
import { getDb, schema } from "../db";
import type { Agent, Buyer } from "../db/schema";
import { stripNulls } from "../buyers";
import { ProfilePatch, patchToUpdate, profileFieldsJsonSchema } from "../profile";
import { runAgent, type ToolSpec } from "./provider";

const createBuyersTool: ToolSpec = {
  name: "create_buyer_profiles",
  description:
    "Create one buyer/renter profile per distinct client found in the imported material. Call this exactly once with every client.",
  schema: {
    type: "object",
    properties: {
      buyers: {
        type: "array",
        items: {
          type: "object",
          properties: profileFieldsJsonSchema,
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
  await runAgent({
    system: SYSTEM,
    messages: [{ role: "user", content: `Import these clients:\n\n<material>\n${material}\n</material>` }],
    tools: [createBuyersTool],
    // Only read pages when the material actually has links in it.
    web: /https?:\/\//i.test(material) ? { searches: 0, pageReads: 5 } : undefined,
    maxTokens: 32000,
    finalTool: "create_buyer_profiles",
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
