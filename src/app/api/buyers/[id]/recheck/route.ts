import { NextResponse } from "next/server";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { getOwnedBuyer } from "@/lib/buyers";
import { limit } from "@/lib/rate-limit";
import { recheckSavedHomes } from "@/lib/ai/recheck";

export const maxDuration = 300;

/** Looks at this client's saved homes again, right now, for price drops and status changes. */
export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const agent = await apiAgent();
  const buyer = await getOwnedBuyer(agent.id, (await params).id);
  limit([`recheck:${agent.id}`], 10, 10);
  // The agent is looking at the screen, so the result is shown there instead of pushed to their phone.
  return NextResponse.json(await recheckSavedHomes(agent, buyer, { push: false }));
});
