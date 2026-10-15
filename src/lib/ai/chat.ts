import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Agent, Buyer } from "../db/schema";
import { applyProfilePatch } from "../buyers";
import { changedFieldLabels, profileFieldsJsonSchema, profileForPrompt } from "../profile";
import { runAgentLoop, webSearchTool } from "./claude";

const updateProfileTool: Anthropic.Messages.Tool = {
  name: "update_buyer_profile",
  description:
    "Save new or corrected information about this buyer to their profile. Call it whenever the agent shares anything about the buyer's needs, budget, places they need to be near, preferences, or situation. Only include fields that changed. For list fields, send the COMPLETE updated list (existing items you're keeping plus new ones). Always also send a refreshed aiSummary.",
  input_schema: {
    type: "object",
    properties: profileFieldsJsonSchema as unknown as Record<string, unknown>,
  },
};

function systemPrompt(agent: Agent, buyer: Buyer) {
  const today = new Date().toLocaleDateString("en-US", { dateStyle: "full" });
  return `You are AgentPulse, an AI assistant for real estate agent ${agent.name}${
    agent.brokerage ? ` (${agent.brokerage})` : ""
  }${agent.marketArea ? `, who works the ${agent.marketArea} market` : ""}. Today is ${today}.

You are talking with the AGENT (not the buyer) about one of their clients. Your job is to build and keep evolving an accurate profile of this client so AgentPulse can find and score homes for them.

Current profile:
<profile>
${profileForPrompt(buyer)}
</profile>

How to behave:
- Whenever the agent tells you anything about the client (budget, must-haves, family, job location, schools, pets, commute, style, timing, what they liked or hated about a showing), call update_buyer_profile right away to save it. Infer structured fields sensibly (e.g. "she works at Cooper Hospital in Camden" → an important place labeled "Work"). Never invent facts the agent didn't give you.
- Ask at most one or two short follow-up questions that would most improve the home search (e.g. missing budget, beds, target areas, or the places they need to be close to).
- You can use web search for market or neighborhood questions (school districts, typical prices, commute areas). Keep answers short and practical.
- To run a full home search, tell the agent to press "Find homes" on this page; it searches Zillow, Redfin, Realtor.com, rental sites and more and scores each home 1–10.
- Be concise and friendly. Plain sentences, no long bullet dumps.`;
}

export async function chatAboutBuyer(agent: Agent, buyer: Buyer, userText: string) {
  const db = await getDb();
  const history = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.buyerId, buyer.id))
    .orderBy(asc(schema.messages.createdAt));

  // Build alternating user/assistant turns (merging any back-to-back turns from failed requests).
  const msgs: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of [...history.slice(-40), { role: "user", content: userText }]) {
    const role = m.role === "assistant" ? "assistant" : "user";
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += `\n\n${m.content}`;
    else msgs.push({ role, content: m.content });
  }
  // The API needs the conversation to start with a user turn.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();

  await db.insert(schema.messages).values({ buyerId: buyer.id, role: "user", content: userText });

  let current = buyer;
  const changed = new Set<string>();

  const { text } = await runAgentLoop({
    system: systemPrompt(agent, current),
    messages: msgs,
    tools: [updateProfileTool, webSearchTool(3)],
    maxTokens: 4000,
    onClientTool: async (name, input) => {
      if (name !== "update_buyer_profile") return { result: `Unknown tool ${name}` };
      const { buyer: updated, patch } = await applyProfilePatch(current, input);
      current = updated;
      changedFieldLabels(patch).forEach((l) => changed.add(l));
      return { result: `Saved. Updated profile:\n${profileForPrompt(updated)}` };
    },
  });

  const reply = text || (changed.size ? "Got it — I've updated the profile." : "Okay.");
  const [saved] = await db
    .insert(schema.messages)
    .values({ buyerId: buyer.id, role: "assistant", content: reply })
    .returning();

  return { reply: saved, buyer: current, changed: [...changed] };
}
