import { NextResponse } from "next/server";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { appUrlFrom } from "@/lib/brief";
import { getOwnedBuyer } from "@/lib/buyers";
import { activeShareLink, createShareLink, revokeShareLinks } from "@/lib/share-links";
import type { ShareLink } from "@/lib/db/schema";

type Ctx = { params: Promise<{ id: string }> };

const describe = (req: Request, link: ShareLink, token: string | null) => ({
  url: token ? `${appUrlFrom(req)}/s/${token}` : null,
  expiresAt: link.expiresAt,
  lastViewedAt: link.lastViewedAt,
  viewCount: link.viewCount,
});

export const GET = handler(async (req: Request, { params }: Ctx) => {
  const agent = await apiAgent();
  const buyer = await getOwnedBuyer(agent.id, (await params).id);
  const active = await activeShareLink(buyer.id);
  return NextResponse.json({ link: active ? describe(req, active.link, active.token) : null });
});

/** Makes a new private link for this client. Any earlier link stops working. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const agent = await apiAgent();
  const buyer = await getOwnedBuyer(agent.id, (await params).id);
  const { link, token } = await createShareLink(buyer.id);
  return NextResponse.json({ link: describe(req, link, token) });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const agent = await apiAgent();
  const buyer = await getOwnedBuyer(agent.id, (await params).id);
  await revokeShareLinks(buyer.id);
  return NextResponse.json({ link: null });
});
