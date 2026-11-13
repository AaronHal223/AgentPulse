import http from "node:http";
import type { AddressInfo } from "node:net";

type Reply = (prompt: string) => unknown;

/**
 * Stands in for the Gemini API so tests can run AI features end to end without a key.
 * `reply` gets the text of the request and returns the JSON the "model" should answer with.
 * Call before the first AI request in a test file.
 */
export async function stubGemini(reply: Reply): Promise<{ prompts: string[]; setReply: (r: Reply) => void; close: () => void }> {
  const prompts: string[] = [];
  let current = reply;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      prompts.push(body);
      const text = JSON.stringify(current(body));
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { prompts, setReply: (r) => (current = r), close: () => server.close() };
}
