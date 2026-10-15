import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";

const Body = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  brokerage: z.string().trim().max(160).optional(),
  marketArea: z.string().trim().max(160).optional(),
  briefEmail: z.string().trim().email().or(z.literal("")).optional(),
  briefEnabled: z.boolean().optional(),
});

export const PATCH = handler(async (req: Request) => {
  const agent = await apiAgent();
  const body = Body.parse(await req.json());
  const db = await getDb();
  await db
    .update(schema.agents)
    .set({
      ...body,
      brokerage: body.brokerage === "" ? null : body.brokerage,
      marketArea: body.marketArea === "" ? null : body.marketArea,
      briefEmail: body.briefEmail === "" ? null : body.briefEmail,
    })
    .where(eq(schema.agents.id, agent.id));
  return NextResponse.json({ ok: true });
});
