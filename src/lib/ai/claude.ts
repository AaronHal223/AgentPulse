import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AiServiceError, type AgentRequest, type AgentResult } from "./types";

let client: Anthropic | null = null;

function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to your environment (see README).");
  }
  client ??= new Anthropic();
  return client;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

const webSearchTool = (maxUses: number) =>
  ({ type: "web_search_20260318", name: "web_search", max_uses: maxUses }) as unknown as Anthropic.Messages.ToolUnion;

const webFetchTool = (maxUses: number) =>
  ({
    type: "web_fetch_20260318",
    name: "web_fetch",
    max_uses: maxUses,
    max_content_tokens: 12000,
  }) as unknown as Anthropic.Messages.ToolUnion;

function toolsFor(req: AgentRequest): Anthropic.Messages.ToolUnion[] {
  const tools: Anthropic.Messages.ToolUnion[] = req.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.schema as Anthropic.Messages.Tool.InputSchema,
  }));
  if (req.web?.searches) tools.push(webSearchTool(req.web.searches));
  if (req.web?.pageReads) tools.push(webFetchTool(req.web.pageReads));
  return tools;
}

/**
 * Runs a Claude conversation that may use server tools (web search / fetch) and our own
 * client tools. Handles `pause_turn` (long searches) and client tool round-trips.
 */
export async function runClaude(req: AgentRequest): Promise<AgentResult> {
  try {
    return await loop(req);
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      const busy = err.status === 429 || err.status === 529 || (err.status ?? 0) >= 500;
      throw new AiServiceError(
        busy
          ? "The AI service is busy right now. Please try again in a minute."
          : `The AI service returned an error (${err.status ?? "unknown"}).`,
        busy,
      );
    }
    throw err;
  }
}

async function loop(req: AgentRequest): Promise<AgentResult> {
  const messages: Anthropic.Messages.MessageParam[] = req.messages.map((m) => ({ ...m }));
  const tools = toolsFor(req);
  const maxSteps = req.maxSteps ?? 12;
  let lastText = "";
  let toolChoice: Anthropic.Messages.ToolChoice | undefined;
  let nudged = false;

  for (let step = 0; step < maxSteps; step++) {
    // Streaming avoids HTTP timeouts on long web-research turns; we just wait for the final message.
    const res = await claude()
      .messages.stream({
        model: MODEL,
        max_tokens: req.maxTokens ?? 8000,
        system: req.system,
        messages,
        tools,
        ...(toolChoice ? { tool_choice: toolChoice } : {}),
      })
      .finalMessage();

    const text = res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (text) lastText = text;

    if (res.stop_reason === "pause_turn") {
      // Long-running server tool turn: send it back unchanged so Claude continues.
      messages.push({ role: "assistant", content: res.content });
      continue;
    }

    if (res.stop_reason === "tool_use") {
      const toolUses = res.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
      );
      if (!toolUses.length || !req.onClientTool) return { text: lastText, stopped: false };

      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.Messages.ToolResultBlockParam[] = [];
      let stop = false;
      for (const tu of toolUses) {
        try {
          const out = await req.onClientTool(tu.name, tu.input);
          results.push({ type: "tool_result", tool_use_id: tu.id, content: out.result });
          if (out.stop) stop = true;
        } catch (err) {
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          });
        }
      }
      if (stop) return { text: lastText, stopped: true };
      messages.push({ role: "user", content: results });
      continue;
    }

    // end_turn, max_tokens, etc. If a final answer tool was expected, nudge once and force it.
    if (req.finalTool && !nudged && res.stop_reason === "end_turn") {
      nudged = true;
      messages.push({ role: "assistant", content: res.content });
      messages.push({ role: "user", content: `Now call ${req.finalTool} with your results.` });
      toolChoice = { type: "tool", name: req.finalTool };
      continue;
    }
    return { text: lastText, stopped: false };
  }
  return { text: lastText, stopped: false };
}
