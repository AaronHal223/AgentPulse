import { NextResponse } from "next/server";
import { z } from "zod";
import { handler } from "@/lib/api";
import { changePassword, MIN_PASSWORD } from "@/lib/account";
import { apiAgent, startSession } from "@/lib/auth";
import { limit } from "@/lib/rate-limit";

const Body = z.object({
  current: z.string().min(1, "Enter your current password").max(200),
  next: z.string().min(MIN_PASSWORD, `The new password must be at least ${MIN_PASSWORD} characters`).max(200),
});

/** Changes the password. Other devices are logged out; this one stays in. */
export const POST = handler(async (req: Request) => {
  const agent = await apiAgent();
  limit([`account:${agent.id}`], 10, 15);
  const { current, next } = Body.parse(await req.json());
  await startSession(await changePassword(agent, current, next));
  return NextResponse.json({ ok: true });
});
