import { NextResponse } from "next/server";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { getOwnedBuyer } from "@/lib/buyers";
import { searchHomesForBuyer } from "@/lib/ai/search";

// Web research takes a minute or two.
export const maxDuration = 300;

export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const agent = await apiAgent();
  const buyer = await getOwnedBuyer(agent.id, (await params).id);
  const result = await searchHomesForBuyer(agent, buyer);
  return NextResponse.json(result);
});
