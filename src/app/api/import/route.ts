import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAgent, HttpError } from "@/lib/auth";
import { handler } from "@/lib/api";
import { importBuyers } from "@/lib/ai/import";

export const maxDuration = 300;

const Body = z.object({ material: z.string().trim().min(3, "Paste something to import").max(200_000) });

export const POST = handler(async (req: Request) => {
  const agent = await apiAgent();
  const { material } = Body.parse(await req.json());
  const buyers = await importBuyers(agent, material);
  if (!buyers.length) throw new HttpError(422, "I couldn't find any clients in that. Try including names and what they're looking for.");
  return NextResponse.json({ buyers });
});
