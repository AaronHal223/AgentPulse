import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAgent, HttpError } from "@/lib/auth";
import { handler } from "@/lib/api";
import { getOwnedBuyer } from "@/lib/buyers";
import { analyzeListingLink } from "@/lib/ai/search";

export const maxDuration = 180;

const Body = z.object({ url: z.string().trim().url("Paste a full link starting with https://") });

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const agent = await apiAgent();
  const buyer = await getOwnedBuyer(agent.id, (await params).id);
  const { url } = Body.parse(await req.json());
  const match = await analyzeListingLink(agent, buyer, url);
  if (!match) throw new HttpError(422, "Couldn't read that listing. Try another link for the same home.");
  return NextResponse.json({ match });
});
