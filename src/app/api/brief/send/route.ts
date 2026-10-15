import { NextResponse } from "next/server";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { appUrlFrom, sendBriefForAgent } from "@/lib/brief";

export const POST = handler(async (req: Request) => {
  const agent = await apiAgent();
  const sent = await sendBriefForAgent(agent, appUrlFrom(req));
  return NextResponse.json({ sent, to: agent.briefEmail || agent.email });
});
