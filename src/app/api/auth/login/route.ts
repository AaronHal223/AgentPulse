import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { startSession, HttpError } from "@/lib/auth";
import { handler } from "@/lib/api";
import { clientIp, limit, reset } from "@/lib/rate-limit";

const Body = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password").max(200),
});

// Compared against when the email doesn't exist, so response time doesn't reveal which emails have accounts.
const DUMMY_HASH = "$2b$12$ycA.utL3KP3RHIzA5b0hmeIfrSNCkKJaNwGOM8UnOYRyAlC0wfwqK";

export const POST = handler(async (req: Request) => {
  const body = Body.parse(await req.json());
  // 10 tries per account and 30 per network address every 15 minutes.
  limit([`login:email:${body.email}`], 10, 15);
  limit([`login:ip:${clientIp(req)}`], 30, 15);

  const db = await getDb();
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.email, body.email)).limit(1);
  const valid = await bcrypt.compare(body.password, agent?.passwordHash ?? DUMMY_HASH);
  if (!agent || !valid) throw new HttpError(401, "Email or password is incorrect.");

  reset(`login:email:${body.email}`);
  await startSession(agent.id);
  return NextResponse.json({ ok: true });
});
