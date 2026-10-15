import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { startSession, HttpError } from "@/lib/auth";
import { handler } from "@/lib/api";

const Body = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export const POST = handler(async (req: Request) => {
  const body = Body.parse(await req.json());
  const db = await getDb();
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.email, body.email)).limit(1);
  if (!agent || !(await bcrypt.compare(body.password, agent.passwordHash))) {
    throw new HttpError(401, "Email or password is incorrect.");
  }
  await startSession(agent.id);
  return NextResponse.json({ ok: true });
});
