import "server-only";
import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { HttpError } from "./errors";

/**
 * Web Push: notifications on the agent's phone or computer, free through the browser makers'
 * own push services. Needs a VAPID key pair (`npx web-push generate-vapid-keys`).
 */

export type PushNote = { title: string; body: string; url: string; tag?: string };

type Vapid = { subject: string; publicKey: string; privateKey: string };

function vapid(): Vapid | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  // Push services want a way to reach whoever runs the site: a mailto: or https: address.
  const subject = (process.env.VAPID_SUBJECT || process.env.APP_URL || "").trim();
  if (!publicKey || !privateKey || !/^(mailto:|https:\/\/)/.test(subject)) return null;
  return { subject, publicKey, privateKey };
}

export const pushConfigured = () => vapid() !== null;
export const vapidPublicKey = () => vapid()?.publicKey ?? null;

// The server posts to whatever address a subscription names, so only real push services are allowed.
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  "notify.windows.com",
];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export type SubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Remembers a device for this agent. A device that changes hands moves to the new agent. */
export async function saveSubscription(agentId: string, sub: SubscriptionInput) {
  if (!isPushEndpoint(sub.endpoint)) throw new HttpError(400, "This browser's notification service isn't supported.");
  const values = { agentId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
  const db = await getDb();
  await db
    .insert(schema.pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: values });
}

export async function removeSubscription(agentId: string, endpoint: string) {
  const db = await getDb();
  await db
    .delete(schema.pushSubscriptions)
    .where(and(eq(schema.pushSubscriptions.agentId, agentId), eq(schema.pushSubscriptions.endpoint, endpoint)));
}

/** True when the push service says this device is gone for good (app removed, permission revoked). */
const isGone = (err: unknown) => {
  const status = (err as { statusCode?: number }).statusCode;
  return status === 404 || status === 410;
};

/**
 * Sends one notification to every device the agent turned on. Never throws: a notification
 * is a nicety, and the alert is already saved in the app. Returns how many devices took it.
 */
export async function pushToAgent(agentId: string, note: PushNote): Promise<number> {
  const keys = vapid();
  if (!keys) return 0;
  let delivered = 0;
  try {
    const db = await getDb();
    const devices = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.agentId, agentId));
    for (const device of devices) {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          JSON.stringify(note),
          { vapidDetails: keys, TTL: 24 * 3600, timeout: 10_000 },
        );
        delivered++;
      } catch (err) {
        if (isGone(err)) await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, device.id));
        else console.warn("push failed", (err as { statusCode?: number }).statusCode ?? err);
      }
    }
  } catch (err) {
    console.warn("push skipped", err);
  }
  return delivered;
}
