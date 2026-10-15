import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { startSession, HttpError } from "@/lib/auth";
import { handler } from "@/lib/api";

const Body = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  brokerage: z.string().trim().max(160).optional(),
  marketArea: z.string().trim().max(160).optional(),
});

export const POST = handler(async (req: Request) => {
  const body = Body.parse(await req.json());
  const db = await getDb();
  const existing = await db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(eq(schema.agents.email, body.email))
    .limit(1);
  if (existing.length) throw new HttpError(409, "An account with that email already exists.");

  const [agent] = await db
    .insert(schema.agents)
    .values({
      name: body.name,
      email: body.email,
      passwordHash: await bcrypt.hash(body.password, 10),
      brokerage: body.brokerage || null,
      marketArea: body.marketArea || null,
      briefEmail: body.email,
    })
    .returning({ id: schema.agents.id });
  await startSession(agent.id);
  return NextResponse.json({ ok: true });
});
