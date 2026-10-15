import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { applyProfilePatch, getOwnedBuyer } from "@/lib/buyers";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const agent = await apiAgent();
  const buyer = await getOwnedBuyer(agent.id, (await params).id);
  const { buyer: updated } = await applyProfilePatch(buyer, await req.json(), { allowClear: true });
  return NextResponse.json({ buyer: updated });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const agent = await apiAgent();
  const buyer = await getOwnedBuyer(agent.id, (await params).id);
  const db = await getDb();
  await db.delete(schema.buyers).where(eq(schema.buyers.id, buyer.id));
  return NextResponse.json({ ok: true });
});
