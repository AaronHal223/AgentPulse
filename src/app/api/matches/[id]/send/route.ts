import { NextResponse } from "next/server";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { getOwnedMatch, markSent, unmarkSent } from "@/lib/feedback";

type Ctx = { params: Promise<{ id: string }> };

/** Records that the agent sent this home to their client. The agent does the actual sending. */
export const POST = handler(async (_req: Request, { params }: Ctx) => {
  const agent = await apiAgent();
  const { match } = await getOwnedMatch(agent.id, (await params).id);
  return NextResponse.json(await markSent(match));
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const agent = await apiAgent();
  const { match } = await getOwnedMatch(agent.id, (await params).id);
  await unmarkSent(match);
  return NextResponse.json({ ok: true });
});
