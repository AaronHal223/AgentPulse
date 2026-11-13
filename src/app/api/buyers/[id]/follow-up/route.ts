import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { appUrlFrom } from "@/lib/brief";
import { getOwnedBuyer } from "@/lib/buyers";
import { limit } from "@/lib/rate-limit";
import { activeShareLink } from "@/lib/share-links";
import { draftFollowUp } from "@/lib/ai/follow-up";

export const maxDuration = 120;

const Body = z.object({ channel: z.enum(["text", "email"]) });

/** Writes a follow-up draft for the agent to edit. Nothing is sent from here. */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const agent = await apiAgent();
  const buyer = await getOwnedBuyer(agent.id, (await params).id);
  limit([`follow-up:${agent.id}`], 20, 10);
  const { channel } = Body.parse(await req.json());
  const share = await activeShareLink(buyer.id);
  const pageUrl = share?.token ? `${appUrlFrom(req)}/s/${share.token}` : null;
  return NextResponse.json(await draftFollowUp(agent, buyer, channel, pageUrl));
});
