import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { getOwnedBuyer } from "@/lib/buyers";
import { confirmVoiceNote } from "@/lib/voice-notes";

type Ctx = { params: Promise<{ id: string; noteId: string }> };

const Body = z.object({ fields: z.array(z.string().max(40)).max(40) });

/** Saves the suggestions the agent ticked to the client's profile. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const agent = await apiAgent();
  const { id, noteId } = await params;
  const buyer = await getOwnedBuyer(agent.id, id);
  const { fields } = Body.parse(await req.json());
  return NextResponse.json(await confirmVoiceNote(buyer, noteId, fields));
});
