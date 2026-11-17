import { NextResponse } from "next/server";
import { z } from "zod";
import { handler } from "@/lib/api";
import { changeEmail } from "@/lib/account";
import { apiAgent } from "@/lib/auth";
import { limit } from "@/lib/rate-limit";

const Body = z.object({
  password: z.string().min(1, "Enter your password").max(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
});

export const POST = handler(async (req: Request) => {
  const agent = await apiAgent();
  limit([`account:${agent.id}`], 10, 15);
  const { password, email } = Body.parse(await req.json());
  const updated = await changeEmail(agent, password, email);
  return NextResponse.json({ email: updated.email });
});
