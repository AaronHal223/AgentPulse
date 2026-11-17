import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { apiAgent } from "@/lib/auth";
import { limit } from "@/lib/rate-limit";
import { createSampleClient, removeSampleClient } from "@/lib/sample";

/** Adds a practice client with example homes to the logged-in agent's list. */
export const POST = handler(async () => {
  const agent = await apiAgent();
  limit([`sample:${agent.id}`], 10, 10);
  const buyer = await createSampleClient(agent.id);
  return NextResponse.json({ id: buyer.id });
});

export const DELETE = handler(async () => {
  const agent = await apiAgent();
  await removeSampleClient(agent.id);
  return NextResponse.json({ ok: true });
});
