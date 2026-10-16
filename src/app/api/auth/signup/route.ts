import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { startSession, HttpError } from "@/lib/auth";
import { handler } from "@/lib/api";
import { clientIp, limit } from "@/lib/rate-limit";

const Body = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  password: z.string().min(10, "Password must be at least 10 characters").max(200),
  brokerage: z.string().trim().max(160).optional(),
  marketArea: z.string().trim().max(160).optional(),
  inviteCode: z.string().trim().max(200).optional(),
});

function inviteOk(given: string | undefined) {
  const code = process.env.SIGNUP_CODE;
  if (!code) return true; // open sign-up
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(code);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST = handler(async (req: Request) => {
  limit([`signup:ip:${clientIp(req)}`], 10, 60);
  const body = Body.parse(await req.json());
  // With SIGNUP_CODE set, only people you give the code to can create accounts (and spend your AI credits).
  if (!inviteOk(body.inviteCode)) throw new HttpError(403, "That invite code isn't right. Ask the AgentPulse owner for the code.");

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
      passwordHash: await bcrypt.hash(body.password, 12),
      brokerage: body.brokerage || null,
      marketArea: body.marketArea || null,
      briefEmail: body.email,
    })
    .returning({ id: schema.agents.id });
  await startSession(agent.id);
  return NextResponse.json({ ok: true });
});
