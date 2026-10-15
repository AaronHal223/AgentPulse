import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { getOwnedBuyer } from "@/lib/buyers";
import { chatAboutBuyer } from "@/lib/ai/chat";

export const maxDuration = 120;

const Body = z.object({ message: z.string().trim().min(1).max(8000) });

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const agent = await apiAgent();
  const buyer = await getOwnedBuyer(agent.id, (await params).id);
  const { message } = Body.parse(await req.json());
  const result = await chatAboutBuyer(agent, buyer, message);
  return NextResponse.json(result);
});
