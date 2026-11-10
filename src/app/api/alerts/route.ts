import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { listAlerts, markAlertsRead, unreadAlertCount } from "@/lib/alerts";

export const GET = handler(async () => {
  const agent = await apiAgent();
  const [alerts, unread] = await Promise.all([listAlerts(agent.id), unreadAlertCount(agent.id)]);
  return NextResponse.json({ alerts, unread });
});

const Body = z.object({ ids: z.array(z.string().max(64)).max(200).optional() });

/** Marks the given alerts as read, or all of them when no ids are sent. */
export const PATCH = handler(async (req: Request) => {
  const agent = await apiAgent();
  const { ids } = Body.parse(await req.json());
  await markAlertsRead(agent.id, ids);
  return NextResponse.json({ unread: await unreadAlertCount(agent.id) });
});
