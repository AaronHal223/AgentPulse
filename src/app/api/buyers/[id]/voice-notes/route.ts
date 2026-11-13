import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { getOwnedBuyer } from "@/lib/buyers";
import { limit } from "@/lib/rate-limit";
import { createVoiceNote } from "@/lib/voice-notes";

export const maxDuration = 120;

const Body = z.object({ transcript: z.string().trim().min(3, "Say or type a little more first.").max(6000) });

/** Reads a voice note and answers with suggested profile changes for the agent to confirm. */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const agent = await apiAgent();
  const buyer = await getOwnedBuyer(agent.id, (await params).id);
  limit([`voice:${agent.id}`], 30, 10);
  const { transcript } = Body.parse(await req.json());
  return NextResponse.json(await createVoiceNote(agent, buyer, transcript));
});
