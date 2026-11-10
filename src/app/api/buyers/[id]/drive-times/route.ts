import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { getOwnedBuyer } from "@/lib/buyers";
import { getDb, schema } from "@/lib/db";
import { driveTimesConfigured, refreshDriveTimes } from "@/lib/drive-times";
import { limit } from "@/lib/rate-limit";

export const maxDuration = 120;

/** Places this client's homes on the map and recalculates drive times to their important places. */
export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const agent = await apiAgent();
  const buyer = await getOwnedBuyer(agent.id, (await params).id);
  limit([`drive-times:${agent.id}`], 6, 10);
  const result = await refreshDriveTimes(buyer);
  const db = await getDb();
  const [fresh] = await db.select({ anchors: schema.buyers.anchors }).from(schema.buyers).where(eq(schema.buyers.id, buyer.id));
  return NextResponse.json({ ...result, anchors: fresh.anchors, configured: driveTimesConfigured() });
});
