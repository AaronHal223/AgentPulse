import "server-only";
import { runClaude } from "./claude";
import { runGemini } from "./gemini";
import type { AgentRequest, AgentResult } from "./types";

export type AiProvider = "gemini" | "claude";

/**
 * Which AI runs the app. Set AI_PROVIDER=claude to switch to Claude; anything else (or nothing)
 * means Gemini.
 */
export function aiProvider(): AiProvider {
  return process.env.AI_PROVIDER?.trim().toLowerCase() === "claude" ? "claude" : "gemini";
}

/** True when the key for the active provider is set. */
export function aiConfigured(): boolean {
  return Boolean(aiProvider() === "claude" ? process.env.ANTHROPIC_API_KEY : process.env.GEMINI_API_KEY);
}

/**
 * False while running on Gemini's free tier, where Google may use what's sent to improve its
 * products. Set GEMINI_PAID_TIER=true once billing is on in Google AI Studio. Claude's API
 * doesn't train on what it's sent.
 */
export function aiIsPrivate(): boolean {
  return aiProvider() === "claude" || process.env.GEMINI_PAID_TIER?.trim().toLowerCase() === "true";
}

/** True when the active provider can listen to a recording. Claude's API takes text and images only. */
export function aiHearsAudio(): boolean {
  return aiProvider() === "gemini";
}

export function runAgent(req: AgentRequest): Promise<AgentResult> {
  return aiProvider() === "claude" ? runClaude(req) : runGemini(req);
}

export type { AgentRequest, AgentResult, AudioClip, ChatTurn, ClientToolHandler, ToolSpec } from "./types";
export { AiServiceError } from "./types";
