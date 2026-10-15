import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to your environment (see README).");
  }
  client ??= new Anthropic();
  return client;
}

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export const webSearchTool = (maxUses: number) =>
  ({ type: "web_search_20260318", name: "web_search", max_uses: maxUses }) as unknown as Anthropic.Messages.ToolUnion;

export const webFetchTool = (maxUses: number) =>
  ({
    type: "web_fetch_20260318",
    name: "web_fetch",
    max_uses: maxUses,
    max_content_tokens: 12000,
  }) as unknown as Anthropic.Messages.ToolUnion;

export type ClientToolHandler = (
  name: string,
  input: unknown,
) => Promise<{ result: string; stop?: boolean }>;

/**
 * Runs a Claude conversation that may use server tools (web search / fetch) and our own
 * client tools. Handles `pause_turn` (long searches) and client tool round-trips.
 * Returns the final assistant text. A client tool handler can return `stop: true` to end early
 * (used for "report results" style tools).
 */
export async function runAgentLoop(opts: {
  system: string;
  messages: Anthropic.Messages.MessageParam[];
  tools: Anthropic.Messages.ToolUnion[];
  onClientTool?: ClientToolHandler;
  maxTokens?: number;
  maxSteps?: number;
  toolChoice?: Anthropic.Messages.ToolChoice;
  /** If Claude finishes without calling this client tool, nudge it once and force the call. */
  requireTool?: string;
}): Promise<{ text: string; stopped: boolean }> {
  const messages = [...opts.messages];
  const maxSteps = opts.maxSteps ?? 12;
  let lastText = "";
  let toolChoice = opts.toolChoice;
  let nudged = false;

  for (let step = 0; step < maxSteps; step++) {
    // Streaming avoids HTTP timeouts on long web-research turns; we just wait for the final message.
    const res = await claude()
      .messages.stream({
        model: MODEL,
        max_tokens: opts.maxTokens ?? 8000,
        system: opts.system,
        messages,
        tools: opts.tools,
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
      if (!toolUses.length || !opts.onClientTool) return { text: lastText, stopped: false };

      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.Messages.ToolResultBlockParam[] = [];
      let stop = false;
      for (const tu of toolUses) {
        try {
          const out = await opts.onClientTool(tu.name, tu.input);
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

    // end_turn, max_tokens, etc.
    if (opts.requireTool && !nudged && res.stop_reason === "end_turn") {
      nudged = true;
      messages.push({ role: "assistant", content: res.content });
      messages.push({ role: "user", content: `Now call ${opts.requireTool} with your results.` });
      toolChoice = { type: "tool", name: opts.requireTool };
      continue;
    }
    return { text: lastText, stopped: false };
  }
  return { text: lastText, stopped: false };
}
