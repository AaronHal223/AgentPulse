import { NextResponse } from "next/server";
import { z } from "zod";
import { handler } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { clientIp, limit } from "@/lib/rate-limit";
import { recordClientReaction, resolveShareToken } from "@/lib/share-links";

const Body = z.object({
  matchId: z.string().min(1).max(64),
  reaction: z.enum(["liked", "disliked"]).nullable(),
  note: z.string().trim().max(500).optional(),
});

/**
 * A client's thumbs-up / thumbs-down from their private page. There is no login here: the
 * long random token in the address is the only key, and it only opens that one client's homes.
 */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  limit([`share:ip:${clientIp(req)}`], 120, 10);
  const page = await resolveShareToken(token);
  if (!page) throw new HttpError(404, "This link is no longer active. Ask your agent for a new one.");
  limit([`share:link:${page.link.id}`], 60, 10);

  const body = Body.parse(await req.json());
  await recordClientReaction(page, body.matchId, body.reaction, body.note);
  return NextResponse.json({ ok: true });
});
