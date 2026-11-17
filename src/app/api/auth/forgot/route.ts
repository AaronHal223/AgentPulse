import { NextResponse } from "next/server";
import { z } from "zod";
import { handler } from "@/lib/api";
import { requestPasswordReset } from "@/lib/account";
import { appUrlFrom } from "@/lib/brief";
import { clientIp, limit } from "@/lib/rate-limit";

const Body = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email").max(254) });

/** Sends a password reset link. The answer is the same whether or not the email has an account. */
export const POST = handler(async (req: Request) => {
  const { email } = Body.parse(await req.json());
  limit([`forgot:email:${email}`], 3, 60);
  limit([`forgot:ip:${clientIp(req)}`], 10, 60);
  await requestPasswordReset(email, appUrlFrom(req));
  return NextResponse.json({ ok: true });
});
