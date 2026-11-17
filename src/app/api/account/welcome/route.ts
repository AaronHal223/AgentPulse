import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { apiAgent } from "@/lib/auth";
import { dismissWelcome } from "@/lib/welcome";

/** Closes the getting-started checklist for good. */
export const POST = handler(async () => {
  const agent = await apiAgent();
  await dismissWelcome(agent.id);
  return NextResponse.json({ ok: true });
});
