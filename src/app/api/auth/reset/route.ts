import { NextResponse } from "next/server";
import { z } from "zod";
import { handler } from "@/lib/api";
import { MIN_PASSWORD, resetPassword } from "@/lib/account";
import { startSession } from "@/lib/auth";
import { clientIp, limit } from "@/lib/rate-limit";

const Body = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters`).max(200),
});

/** Sets a new password from an emailed link and logs the agent in. */
export const POST = handler(async (req: Request) => {
  limit([`reset:ip:${clientIp(req)}`], 10, 15);
  const { token, password } = Body.parse(await req.json());
  await startSession(await resetPassword(token, password));
  return NextResponse.json({ ok: true });
});
