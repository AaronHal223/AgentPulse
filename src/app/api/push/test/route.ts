import { NextResponse } from "next/server";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { limit } from "@/lib/rate-limit";
import { pushToAgent } from "@/lib/push";

/** Sends a sample notification to the agent's own devices, so they can see it works. */
export const POST = handler(async () => {
  const agent = await apiAgent();
  limit([`push-test:${agent.id}`], 5, 5);
  const delivered = await pushToAgent(agent.id, {
    title: "AgentPulse notifications are on",
    body: "You'll hear about price drops, status changes and 8+ matches here.",
    url: "/alerts",
    tag: "test",
  });
  if (!delivered) throw new HttpError(502, "The test didn't reach this device. Turn notifications off and on again, then retry.");
  return NextResponse.json({ delivered });
});
