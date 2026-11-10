/**
 * The client "pulse": how engaged a client is right now, 0–100, and whether today is a good
 * day to call them. Plain arithmetic on activity counts; no AI, no database.
 */

export const PULSE_WINDOW_DAYS = 14;

export type PulseSignals = {
  /** Client thumbs-up, thumbs-down and written notes in the last two weeks. */
  likes: number;
  passes: number;
  notes: number;
  /** Days since the client last reacted or opened their private page. Null if never. */
  daysSinceClientActivity: number | null;
  /** Homes the agent sent that the client hasn't reacted to. */
  awaitingReaction: number;
  daysSinceLastSend: number | null;
  /** In-area homes scoring 8+ that are still for sale and haven't been sent. */
  strongUnsent: number;
  /** Things the agent told AgentPulse about this client lately (chat messages, voice notes). */
  agentNotes: number;
  daysSinceAgentActivity: number | null;
};

export type PulseLevel = "hot" | "warm" | "cooling" | "quiet";
export type Pulse = { score: number; level: PulseLevel };
export type CallReason = { priority: number; reason: string };

function recencyPoints(days: number | null) {
  if (days == null) return 0;
  if (days <= 2) return 30;
  if (days <= 7) return 20;
  return days <= PULSE_WINDOW_DAYS ? 10 : 0;
}

const levelOf = (score: number): PulseLevel => (score >= 65 ? "hot" : score >= 35 ? "warm" : score >= 12 ? "cooling" : "quiet");

export function pulseOf(s: PulseSignals): Pulse {
  const reactions = Math.min(45, s.likes * 15 + s.passes * 10 + s.notes * 5);
  const recency = recencyPoints(s.daysSinceClientActivity);
  const agent = Math.min(15, s.agentNotes * 3);
  // Homes sent in the last few days are a conversation in progress.
  const inPlay = s.awaitingReaction > 0 && s.daysSinceLastSend != null && s.daysSinceLastSend <= 3 ? 10 : 0;
  const score = Math.min(100, reactions + recency + agent + inPlay);
  return { score, level: levelOf(score) };
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Days since anyone, client or agent, did anything. Null when nothing has ever happened. */
function daysSinceContact(s: PulseSignals): number | null {
  const days = [s.daysSinceClientActivity, s.daysSinceAgentActivity, s.daysSinceLastSend].filter((d): d is number => d != null);
  return days.length ? Math.min(...days) : null;
}

/**
 * Why today is a good day to call this client, or null if there's no particular reason.
 * A higher priority goes higher on the "who to call today" list.
 */
export function callReason(s: PulseSignals): CallReason | null {
  const recent = s.daysSinceClientActivity != null && s.daysSinceClientActivity <= 3;
  if (s.likes > 0 && recent) {
    return { priority: 100 + s.likes, reason: `Liked ${count(s.likes, "home")} this week. Line up the showing.` };
  }
  if (s.passes >= 2 && s.likes === 0 && s.daysSinceClientActivity != null && s.daysSinceClientActivity <= 7) {
    return { priority: 85, reason: `Passed on ${s.passes} homes in a row. Ask what's missing.` };
  }
  if (s.strongUnsent > 0) {
    return { priority: 75 + Math.min(s.strongUnsent, 5), reason: `${count(s.strongUnsent, "strong match")} (8+) they haven't seen yet.` };
  }
  if (s.awaitingReaction > 0 && s.daysSinceLastSend != null && s.daysSinceLastSend >= 3) {
    return { priority: 65, reason: `No reaction to ${count(s.awaitingReaction, "home")} you sent ${s.daysSinceLastSend} days ago.` };
  }
  const quietFor = daysSinceContact(s);
  if (quietFor != null && quietFor >= PULSE_WINDOW_DAYS) {
    return { priority: 50, reason: `No contact in ${quietFor} days. A quick check-in keeps them warm.` };
  }
  return null;
}
