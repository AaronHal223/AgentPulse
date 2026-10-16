import "server-only";
import {
  ApiError,
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Part,
  type Tool,
} from "@google/genai";
import { AiServiceError, type AgentRequest, type AgentResult, type ChatTurn } from "./types";

// 2.5 Flash is the newest model that still gets free Google Search on the free tier.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
// Turning research notes into JSON is easy work; a lighter model saves the main model's quota.
const LIGHT_MODEL = process.env.GEMINI_LIGHT_MODEL || "gemini-2.5-flash-lite";

let client: GoogleGenAI | null = null;

function gemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set. Add it to your environment (see README).");
  // GEMINI_BASE_URL is only for pointing tests at a local stand-in server.
  const baseUrl = process.env.GEMINI_BASE_URL;
  client ??= new GoogleGenAI({ apiKey, ...(baseUrl ? { httpOptions: { baseUrl } } : {}) });
  return client;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryDelayMs(message: string, attempt: number) {
  const m = /retry(?:Delay)?["\s:]*(?:in\s*)?"?(\d+(?:\.\d+)?)s/i.exec(message);
  const seconds = m ? Number(m[1]) : 4 * (attempt + 1);
  return Math.min(30, Math.max(1, seconds)) * 1000;
}

function serviceError(err: ApiError): AiServiceError {
  const msg = err.message;
  if (err.status === 429 && /per ?day|perday|daily/i.test(msg)) {
    return new AiServiceError(
      "Today's free Gemini limit is used up. It resets every day, or you can turn on billing in Google AI Studio for more.",
      true,
    );
  }
  if (err.status === 429 || err.status >= 500) {
    return new AiServiceError("The AI service is busy right now. Please try again in a minute.", true);
  }
  if (/api key/i.test(msg) || err.status === 401 || err.status === 403) {
    return new AiServiceError("Gemini rejected the API key. Check GEMINI_API_KEY in your settings.", false);
  }
  if (err.status === 404) {
    return new AiServiceError(`The Gemini model "${MODEL}" isn't available for this key.`, false);
  }
  return new AiServiceError(`The AI service returned an error (${err.status}).`, false);
}

/** One Gemini call, retried a couple of times on short-term rate limits. */
async function generate(params: GenerateContentParameters): Promise<GenerateContentResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await gemini().models.generateContent(params);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      const daily = err.status === 429 && /per ?day|perday|daily/i.test(err.message);
      const retryable = !daily && (err.status === 429 || err.status >= 500);
      if (retryable && attempt < 2) {
        await sleep(retryDelayMs(err.message, attempt));
        continue;
      }
      throw serviceError(err);
    }
  }
}

const toContents = (turns: ChatTurn[]): Content[] =>
  turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] }));

/** Visible text of a reply (skips thinking and function-call parts). */
function replyText(res: GenerateContentResponse): string {
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("")
    .trim();
}

const outputTokens = (n?: number) => Math.max(n ?? 8000, 8192);

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

/**
 * Google Search hands back short-lived redirect links. Follow each one once to learn the real
 * page address; if that fails, the source's title is usually its domain name.
 */
async function realUrl(uri: string, title?: string): Promise<string | null> {
  if (!hostOf(uri).endsWith("vertexaisearch.cloud.google.com")) return uri;
  try {
    const res = await fetch(uri, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(4000) });
    const location = res.headers.get("location");
    if (location && hostOf(location)) return location;
  } catch {
    // fall through to the title
  }
  return title && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(title.trim()) ? `https://${title.trim()}/` : null;
}

async function sourcesOf(res: GenerateContentResponse): Promise<string[]> {
  const candidate = res.candidates?.[0];
  const chunks = (candidate?.groundingMetadata?.groundingChunks ?? []).slice(0, 30);
  const searched = await Promise.all(
    chunks.map((c) => (c.web?.uri ? realUrl(c.web.uri, c.web.title) : Promise.resolve(null))),
  );
  const opened = (candidate?.urlContextMetadata?.urlMetadata ?? [])
    .filter((u) => u.urlRetrievalStatus === "URL_RETRIEVAL_STATUS_SUCCESS")
    .map((u) => u.retrievedUrl);
  return [...new Set([...searched, ...opened].filter((u): u is string => Boolean(u)))];
}

/** A quick Google-grounded answer, used as the chat's "look it up" tool. */
async function webAnswer(query: string): Promise<string> {
  const res = await generate({
    model: MODEL,
    contents: query,
    config: {
      systemInstruction:
        "Answer briefly and factually for a real estate agent, using Google Search. Name the sites your facts come from.",
      tools: [{ googleSearch: {} }],
      maxOutputTokens: 4000,
    },
  });
  return replyText(res) || "No useful results found.";
}

const webResearchTool: FunctionDeclaration = {
  name: "web_research",
  description:
    "Look something up on the web with Google Search: typical prices, school districts, neighborhoods, commute areas. Returns a short answer.",
  parametersJsonSchema: {
    type: "object",
    properties: { query: { type: "string", description: "What to look up, as you'd type it into Google." } },
    required: ["query"],
  },
};

/**
 * Requests that end in one structured answer (home search, import) run in two steps, because
 * Gemini can't mix Google Search with our own tools in one call:
 *   1. research with Google Search / page reading and write up notes,
 *   2. turn those notes into JSON that matches the final tool's schema.
 */
async function researchThenAnswer(req: AgentRequest, finalTool: string): Promise<AgentResult> {
  const tool = req.tools.find((t) => t.name === finalTool);
  if (!tool) throw new Error(`Unknown final tool ${finalTool}`);
  const history = toContents(req.messages);
  let notes = "";
  let sources: string[] | undefined;

  if (req.web && (req.web.searches || req.web.pageReads)) {
    const tools: Tool[] = [];
    if (req.web.searches) tools.push({ googleSearch: {} });
    if (req.web.pageReads) tools.push({ urlContext: {} });
    const res = await generate({
      model: MODEL,
      contents: [
        ...history,
        {
          role: "user",
          parts: [
            {
              text: `Do the research now. In your instructions, web_search means Google Search and web_fetch means opening a page by its URL. You'll fill in ${finalTool} in the next step, so for now write plain notes: for every item, its exact page URL and every fact ${finalTool} needs (including your evaluation). Only include what you actually found.`,
            },
          ],
        },
      ],
      config: { systemInstruction: req.system, tools, maxOutputTokens: outputTokens(req.maxTokens) },
    });
    notes = replyText(res);
    sources = await sourcesOf(res);
  }

  const sourceList = sources?.length
    ? `\n\nPages you actually found or opened (use these exact URLs where they match):\n${sources.map((s) => `- ${s}`).join("\n")}`
    : "";
  const contents: Content[] = notes
    ? [
        ...history,
        { role: "model", parts: [{ text: notes }] },
        {
          role: "user",
          parts: [{ text: `Now give the ${finalTool} input as JSON. Use only what's in your notes.${sourceList}` }],
        },
      ]
    : history;

  const res = await generate({
    model: notes ? LIGHT_MODEL : MODEL,
    contents,
    config: {
      systemInstruction: `${req.system}\n\nReply with the input for ${finalTool} only: ${tool.description}`,
      responseMimeType: "application/json",
      responseJsonSchema: tool.schema,
      maxOutputTokens: outputTokens(req.maxTokens),
    },
  });

  let input: unknown;
  try {
    input = JSON.parse(replyText(res) || "{}");
  } catch {
    throw new AiServiceError("The AI's answer came back incomplete. Please try again.", true);
  }
  const out = await req.onClientTool?.(finalTool, input);
  return { text: notes, stopped: Boolean(out?.stop), sources };
}

/** Back-and-forth chat with our own tools (and a Google lookup tool when web access is on). */
async function chatLoop(req: AgentRequest): Promise<AgentResult> {
  const declarations: FunctionDeclaration[] = req.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parametersJsonSchema: t.schema,
  }));
  const lookups = req.web?.searches ?? 0;
  if (lookups) declarations.push(webResearchTool);

  const contents = toContents(req.messages);
  const maxSteps = req.maxSteps ?? 12;
  let lastText = "";
  let used = 0;

  for (let step = 0; step < maxSteps; step++) {
    const res = await generate({
      model: MODEL,
      contents,
      config: {
        systemInstruction: req.system,
        ...(declarations.length ? { tools: [{ functionDeclarations: declarations }] } : {}),
        maxOutputTokens: outputTokens(req.maxTokens),
      },
    });
    const text = replyText(res);
    if (text) lastText = text;

    const calls = res.functionCalls ?? [];
    const content = res.candidates?.[0]?.content;
    if (!calls.length || !content) return { text: lastText, stopped: false };

    // Send the model's turn back unchanged so its hidden reasoning carries over.
    contents.push(content);
    const parts: Part[] = [];
    let stop = false;
    for (const call of calls) {
      const name = call.name ?? "";
      let result: string;
      try {
        if (name === "web_research") {
          const query = String((call.args as { query?: unknown } | undefined)?.query ?? "");
          result = used++ < lookups ? await webAnswer(query) : "Lookup limit reached for this message.";
        } else if (req.onClientTool) {
          const out = await req.onClientTool(name, call.args ?? {});
          result = out.result;
          if (out.stop) stop = true;
        } else {
          result = `Unknown tool ${name}`;
        }
      } catch (err) {
        if (err instanceof AiServiceError) throw err;
        result = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      parts.push({ functionResponse: { id: call.id, name, response: { result } } });
    }
    if (stop) return { text: lastText, stopped: true };
    contents.push({ role: "user", parts });
  }
  return { text: lastText, stopped: false };
}

export function runGemini(req: AgentRequest): Promise<AgentResult> {
  return req.finalTool ? researchThenAnswer(req, req.finalTool) : chatLoop(req);
}
