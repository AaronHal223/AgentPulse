import { NextResponse } from "next/server";
import { z } from "zod";
import { handler } from "@/lib/api";
import { deleteAccount } from "@/lib/account";
import { apiAgent, endSession } from "@/lib/auth";
import { limit } from "@/lib/rate-limit";

const Body = z.object({ password: z.string().min(1, "Enter your password").max(200) });

/** Deletes the account and all its data for good. Needs the password again. */
export const DELETE = handler(async (req: Request) => {
  const agent = await apiAgent();
  limit([`account:${agent.id}`], 10, 15);
  const { password } = Body.parse(await req.json());
  await deleteAccount(agent, password);
  await endSession();
  return NextResponse.json({ ok: true });
});
