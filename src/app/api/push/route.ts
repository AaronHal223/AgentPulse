import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { pushConfigured, removeSubscription, saveSubscription, vapidPublicKey } from "@/lib/push";

const Subscription = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(200) }),
});

/** The public key a browser needs to subscribe. Null when notifications aren't set up on the server. */
export const GET = handler(async () => {
  await apiAgent();
  return NextResponse.json({ publicKey: vapidPublicKey() });
});

/** Turns notifications on for the device making the request. */
export const POST = handler(async (req: Request) => {
  const agent = await apiAgent();
  if (!pushConfigured()) throw new HttpError(503, "Notifications aren't set up on this server yet.");
  await saveSubscription(agent.id, Subscription.parse(await req.json()));
  return NextResponse.json({ ok: true });
});

export const DELETE = handler(async (req: Request) => {
  const agent = await apiAgent();
  const { endpoint } = z.object({ endpoint: z.string().max(2000) }).parse(await req.json());
  await removeSubscription(agent.id, endpoint);
  return NextResponse.json({ ok: true });
});
