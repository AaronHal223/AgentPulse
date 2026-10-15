import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { apiAgent, HttpError } from "@/lib/auth";
import { handler } from "@/lib/api";

const Body = z.object({ status: z.enum(["new", "saved", "dismissed"]) });

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const agent = await apiAgent();
  const { id } = await params;
  const { status } = Body.parse(await req.json());
  const db = await getDb();
  const [row] = await db
    .select({ id: schema.matches.id })
    .from(schema.matches)
    .innerJoin(schema.buyers, eq(schema.matches.buyerId, schema.buyers.id))
    .where(and(eq(schema.matches.id, id), eq(schema.buyers.agentId, agent.id)))
    .limit(1);
  if (!row) throw new HttpError(404, "Match not found.");
  await db.update(schema.matches).set({ status }).where(eq(schema.matches.id, id));
  return NextResponse.json({ ok: true });
});
