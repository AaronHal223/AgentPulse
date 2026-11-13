import { NextResponse } from "next/server";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { getOwnedMatch, loadFeedback } from "@/lib/feedback";
import { baseScoreOf, explainScore, feedbackAdjustment } from "@/lib/scoring";

/** What helped and hurt this home's score. Worked out fresh each time, with no AI call. */
export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const agent = await apiAgent();
  const { match, buyer } = await getOwnedMatch(agent.id, (await params).id);
  const adjustment = feedbackAdjustment(match, await loadFeedback(buyer.id));
  return NextResponse.json({
    score: match.score,
    baseScore: baseScoreOf(match),
    factors: explainScore(buyer, match, adjustment),
  });
});
