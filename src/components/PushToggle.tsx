"use client";
import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { api } from "./fetcher";

type State = "loading" | "unsupported" | "needs-install" | "not-configured" | "blocked" | "off" | "on";

const HELP: Partial<Record<State, string>> = {
  unsupported: "This browser can't show notifications. Alerts still appear here and in your daily brief.",
  "needs-install": "On iPhone and iPad, add AgentPulse to your Home Screen first (Share → Add to Home Screen), then open it from there.",
  "not-configured": "Notifications aren't set up on this server yet. Alerts still appear here and in your daily brief.",
  blocked: "Notifications are blocked for AgentPulse. Allow them in your phone or browser settings, then come back.",
};

const message = (err: unknown) => (err instanceof Error ? err.message : "That didn't work. Please try again.");

/** The key arrives as URL-safe base64; the browser wants raw bytes. */
function keyBytes(base64: string) {
  const padded = base64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

const serviceWorker = async () =>
  (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));

/** Opt-in switch for notifications on this device, with a test button. */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [publicKey, setPublicKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    detect()
      .then(({ state, publicKey }) => {
        setState(state);
        setPublicKey(publicKey);
      })
      .catch(() => setState("unsupported"));
  }, []);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setNote("");
    try {
      setNote(await action());
    } catch (err) {
      setNote(message(err));
    }
    setBusy(false);
  }

  const turnOn = () =>
    run(async () => {
      if ((await Notification.requestPermission()) !== "granted") {
        setState(Notification.permission === "denied" ? "blocked" : "off");
        return "Notifications weren't allowed, so nothing changed.";
      }
      const registration = await serviceWorker();
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      await api("/api/push", { body: subscription.toJSON() });
      setState("on");
      return "Notifications are on for this device.";
    });

  const turnOff = () =>
    run(async () => {
      const subscription = await (await serviceWorker()).pushManager.getSubscription();
      if (subscription) {
        await api("/api/push", { method: "DELETE", body: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setState("off");
      return "Notifications are off for this device.";
    });

  const sendTest = () =>
    run(async () => {
      await api("/api/push/test", { method: "POST" });
      return "Test sent. It should appear in a few seconds.";
    });

  const on = state === "on";
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${on ? "bg-brand-soft text-brand" : "bg-paper text-ink-soft"}`}>
          {on ? <BellRing size={17} /> : <BellOff size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Notifications on this device</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {HELP[state] ?? "Get a notification for price drops, status changes and new homes that score 8 or higher."}
          </p>
          {(state === "off" || on) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {on ? (
                <>
                  <button onClick={sendTest} disabled={busy} className="btn-ghost !px-3 !py-1.5">Send a test</button>
                  <button onClick={turnOff} disabled={busy} className="btn-ghost !px-3 !py-1.5">Turn off</button>
                </>
              ) : (
                <button onClick={turnOn} disabled={busy} className="btn-brand !px-3 !py-1.5">
                  {busy ? "Turning on…" : "Turn on notifications"}
                </button>
              )}
            </div>
          )}
          {note && <p className="mt-2 text-sm text-ink-soft" role="status">{note}</p>}
        </div>
      </div>
    </div>
  );
}

async function detect(): Promise<{ state: State; publicKey: string }> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    return { state: ios ? "needs-install" : "unsupported", publicKey: "" };
  }
  const { publicKey } = await api<{ publicKey: string | null }>("/api/push");
  if (!publicKey) return { state: "not-configured", publicKey: "" };
  if (Notification.permission === "denied") return { state: "blocked", publicKey };

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return { state: "off", publicKey };
  // Keep the server's copy fresh; browsers quietly replace subscriptions from time to time.
  await api("/api/push", { body: subscription.toJSON() }).catch(() => {});
  return { state: "on", publicKey };
}
