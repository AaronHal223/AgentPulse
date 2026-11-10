import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { getOwnedMatch, setAgentVerdict } from "@/lib/feedback";
import { REJECT_REASONS } from "@/lib/scoring";

const Body = z.object({
  status: z.enum(["new", "saved", "dismissed"]),
  reasons: z.array(z.enum(REJECT_REASONS)).max(REJECT_REASONS.length).optional(),
});

const VERDICT = { new: null, saved: "saved", dismissed: "rejected" } as const;

/** Save, reject (with reasons) or undo. Answers with every score the feedback moved. */
export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const agent = await apiAgent();
  const { match } = await getOwnedMatch(agent.id, (await params).id);
  const { status, reasons } = Body.parse(await req.json());
  const rescored = await setAgentVerdict(match, VERDICT[status], reasons);
  return NextResponse.json({ ok: true, rescored });
});
